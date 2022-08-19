export interface AutoScalerOptions {
  deploymentPollPeriod: number;
  k8sDeployment: string;
  k8sNamespace: string;
  maxPods: number;
  messagesPerPod: number;
  minPods: number;
  pollPeriod: number;
  queueUrl: string;
  scaleWait: number;
}
