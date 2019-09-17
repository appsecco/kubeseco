package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io/ioutil"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	minio "github.com/minio/minio-go"
	nats "github.com/nats-io/go-nats"
	log "github.com/sirupsen/logrus"
)

type PubSubEvent struct {
	ScanID     string `json:"scan_id"`
	AssetType  string `json:"asset_type"`
	AssetValue string `json:"asset_value"`
}

type TargetInfo struct {
	AssetType  string `json:"asset_type"`
	AssetValue string `json:"asset_value"`
}

type CompletionEvent struct {
	ScanID     string     `json:"scan_id"`
	Status     string     `json:"status"`
	ToolName   string     `json:"tool_name"`
	TargetInfo TargetInfo `json:"target_info"`
	Path       string     `json:"path"`
}

var TOOL_ADAPTER_VERSION string // Injected at build time
var COMPLETION_EVENT_ERROR = "Error"
var COMPLETION_EVENT_SUCCESS = "Success"

func getConfigValue(key string) string {
	return os.Getenv(key)
}

func getOutputFilePath() (string, error) {
	file, err := ioutil.TempFile("", "execTool")

	if err != nil {
		log.Warn("Failed to create temporary file: ", err.Error())
		return "", err
	}

	file.Close()
	fp, err := filepath.Abs(file.Name())

	if err != nil {
		log.Warn("Failed to temporary file path: ", err.Error())
		return "", err
	}

	return fp, nil
}

func randomHex(n int) string {
	bytes := make([]byte, n)

	if _, err := rand.Read(bytes); err != nil {
		return "FAILED-TO-GENERATE-RANDOM-HEX"
	}

	return hex.EncodeToString(bytes)
}

// TODO: Shell escape all values
func replaceStrPlaceholders(str string, event *PubSubEvent, outputFilePath string) string {
	str = strings.Replace(str, "{{SCAN_ID}}", event.ScanID, -1)
	str = strings.Replace(str, "{{TARGET}}", event.AssetValue, -1)
	str = strings.Replace(str, "{{OUTPUT_FILE_PATH}}", outputFilePath, -1)
	str = strings.Replace(str, "{{TIMESTAMP}}", strconv.FormatInt(time.Now().UnixNano(), 10), -1)
	str = strings.Replace(str, "{{RANDHEX}}", randomHex(8), -1)
	str = strings.Replace(str, "{{TOOL_NAME}}", getConfigValue("TOOL_NAME"), -1)

	return str
}

func getExecTimeout() int {
	timeout := getConfigValue("TOOL_EXEC_TIMEOUT")

	if timeout == "" {
		timeout = "60"
	}

	t, err := strconv.Atoi(timeout)
	if err != nil {
		return 60
	}

	return t
}

func printUploadStatus(n int64, err error) {
	if err != nil {
		log.Warn("Failed to upload to minio: ", err.Error())
	} else {
		log.Infof("Successfully uploaded to minio: [size %d bytes]", n)
	}
}

func minioDeployOutput(event *PubSubEvent, stdOut bytes.Buffer, outputFilePath string) {
	endpoint := getConfigValue("MINIO_ENDPOINT")
	accessKeyID := getConfigValue("MINIO_ACCESS_KEY")
	secretAccessKey := getConfigValue("MINIO_SECRET_KEY")
	useSSL := false

	log.Infof("Deploying STDOUT:%d bytes OutputFile:%s", stdOut.Len(), outputFilePath)

	client, err := minio.New(endpoint, accessKeyID, secretAccessKey, useSSL)
	if err != nil {
		log.Warn("Failed to connect to Minio endpoint")
		sendCompletionEvent(COMPLETION_EVENT_ERROR, event, getConfigValue("TOOL_NAME"), "")
		return
	}

	bucketName := getConfigValue("MINIO_OUTPUT_BUCKET")
	location := getConfigValue("MINIO_OUTPUT_FILE")

	// Creating Minio bucket. Here we fail silently if bucket exists
	err = client.MakeBucket(bucketName, "us-east-1")
	if err != nil {
		// TODO: Fail if bucket doesn't exist
	}

	// location = strings.Replace(location, "{{SCAN_ID}}", event.ScanID, -1)
	// location = strings.Replace(location, "{{OUTPUT_EVENT}}", eventName, -1)
	location = replaceStrPlaceholders(location, event, outputFilePath)

	log.Info("Writing to Minio: Bucket: ", bucketName, " Location: ", location)

	contentType := "application/json"
	if len(getConfigValue("TOOL_CAPTURE_STDOUT")) > 0 {
		log.Info("Sending stdout to Minio")
		n, err := client.PutObject(bucketName, location, strings.NewReader(stdOut.String()), -1, minio.PutObjectOptions{ContentType: contentType})
		printUploadStatus(n, err)
	} else {
		log.Info("Sending output file to Minio")
		n, err := client.FPutObject(bucketName, location, outputFilePath, minio.PutObjectOptions{ContentType: contentType})
		printUploadStatus(n, err)
	}

	if err != nil {
		log.Info("Sending success completion event")
		sendCompletionEvent(COMPLETION_EVENT_SUCCESS, event, getConfigValue("TOOL_NAME"), location)
	} else {
		log.Warn("Sending error completion event")
		sendCompletionEvent(COMPLETION_EVENT_ERROR, event, getConfigValue("TOOL_NAME"), "")
	}
}

func deployOutput(event *PubSubEvent, stdout bytes.Buffer, outputFilePath string) {
	minioDeployOutput(event, stdout, outputFilePath)
}

func sendCompletionEvent(status string, event *PubSubEvent, toolName string, persistentFilePath string) {
	completionEvent := new(CompletionEvent)
	completionEventTopic := getConfigValue("TOOL_COMPLETION_EVENT_TOPIC")

	if len(completionEventTopic) == 0 {
		log.Warn("Completion event topic is not defined")
		return
	}

	completionEvent.ScanID = event.ScanID
	completionEvent.Status = status
	completionEvent.ToolName = toolName
	completionEvent.TargetInfo.AssetType = event.AssetType
	completionEvent.TargetInfo.AssetValue = event.AssetValue

	if status == COMPLETION_EVENT_SUCCESS {
		completionEvent.Path = persistentFilePath
	}

	jsonEv, err := json.Marshal(completionEvent)
	if err != nil {
		log.Warn("Failed to generate JSON from completion event")
		return
	}

	nc, err := nats.Connect(getConfigValue("NATS_URL"))
	if err != nil {
		log.Warn("Failed to connect to NATS")
		return
	}

	nc.Publish(completionEventTopic, jsonEv)
	log.Info("Published completion event to NATS")

	nc.Close()
}

func execToolAndGetOutput(event *PubSubEvent) {
	log.Info("Executing external tool on PubSub event")

	var err error
	execPattern := getConfigValue("TOOL_EXEC_PATTERN")
	outputFilePath := getConfigValue("TOOL_USE_OUTPUT_FILE_PATH")

	if len(outputFilePath) == 0 {
		outputFilePath, err = getOutputFilePath()
		if err != nil {
			log.Warn("Failed to generated output file path: ", err.Error())
			return
		}
	}

	// TODO: Shell escape this string
	// targetStr := event.AssetValues
	// execPattern = strings.Replace(execPattern, "{{TARGET}}", targetStr, -1)
	// execPattern = strings.Replace(execPattern, "{{OUTPUT_FILE_PATH}}", outputFilePath, -1)
	execPattern = replaceStrPlaceholders(execPattern, event, outputFilePath)

	log.Info("Running exec pattern: ", execPattern)

	// We need this to be able to pipe shell commands
	cmd := exec.Command("sh", "-c", execPattern)

	var stdOut bytes.Buffer
	var stdErr bytes.Buffer

	cmd.Stdout = &stdOut
	cmd.Stderr = &stdErr

	err = cmd.Start()

	done := make(chan error)
	go func() { done <- cmd.Wait() }()

	timeout := time.After(time.Duration(getExecTimeout()) * time.Second)
	select {
	case <-timeout:
		cmd.Process.Kill()
		log.Warn("Command execution timed out!")
	case err := <-done:
		if err != nil {
			log.Warn("Non-zero exit code from command: ", err.Error())

			log.Info("STDOUT: ")
			log.Info(stdOut.String())

			log.Info("STDERR: ")
			log.Info(stdErr.String())

			log.Info("Sending error completion event")
			sendCompletionEvent(COMPLETION_EVENT_ERROR, event, getConfigValue("TOOL_NAME"), "")
		} else {
			log.Info("Command execution finished successfully")

			log.Info("STDOUT: ")
			log.Info(stdOut.String())

			log.Info("STDERR: ")
			log.Info(stdErr.String())

			deployOutput(event, stdOut, outputFilePath)
		}
	}
}

func handleNatsEvent(m *nats.Msg) {
	log.Info("Received a message: ", string(m.Data))

	var event PubSubEvent
	err := json.Unmarshal(m.Data, &event)

	if err != nil {
		log.Warn("Error JSON decoding message: ", err.Error())
		return
	}

	if (event.ScanID == "") || (event.AssetType == "") || (event.AssetValue == "") {
		log.Warn("Input JSON schema is incorrect")
		return
	}

	execToolAndGetOutput(&event)
}

func displayBanner() {
	log.Info("Tool Adapter version: ", TOOL_ADAPTER_VERSION, " running..")
}

func startConsumer() {
	log.Info("Starting consumer loop")
	nc, err := nats.Connect(getConfigValue("NATS_URL"),
		nats.DisconnectHandler(func(c *nats.Conn) {
			log.Warn("NATS connection lost")
		}),
		nats.ReconnectHandler(func(c *nats.Conn) {
			log.Info("Re-established connection with NATS server")
		}),
		nats.ClosedHandler(func(c *nats.Conn) {
			log.Fatal("Connection closed with NATS server")
		}),
		nats.MaxReconnects(5),
		nats.ReconnectWait(10*time.Second))

	if err != nil {
		log.Fatal("Failed to connect NATS: ", err.Error())
		return
	}

	queueGroupName := getConfigValue("NATS_QUEUE_GROUP_NAME")
	if len(queueGroupName) > 0 {
		log.Infof("Using queue subscription with group: %s", queueGroupName)
		nc.QueueSubscribe(getConfigValue("NATS_CONSUMER_TOPIC"), queueGroupName, func(m *nats.Msg) {
			handleNatsEvent(m)
		})
	} else {
		log.Info("Using topic subscription")
		nc.Subscribe(getConfigValue("NATS_CONSUMER_TOPIC"), func(m *nats.Msg) {
			handleNatsEvent(m)
		})
	}

	nc.Flush()
	runtime.Goexit() // Blocking
}

func main() {
	loggerInit()
	displayBanner()
	startConsumer()
}

func loggerInit() {
	formatter := &log.JSONFormatter{
		FieldMap: log.FieldMap{
			log.FieldKeyTime:  "timestamp",
			log.FieldKeyLevel: "severity",
			log.FieldKeyMsg:   "message",
		},
	}

	log.SetFormatter(formatter)
	log.SetOutput(os.Stdout)
	log.SetLevel(log.InfoLevel)
}
