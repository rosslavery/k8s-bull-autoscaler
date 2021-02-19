export interface AutoScalerOptions {
  queueUrl: string;
  k8sDeployment: string;
  k8sNamespace: string;
  pollPeriod: number;
  scaleWait: number;
  messagesPerPod: number;
  maxPods: number;
  minPods: number;
}
