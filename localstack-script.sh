#!/bin/bash
echo "Creating SQS queue..."
awslocal sqs create-queue --queue-name my-queue
echo "SQS queue created."
