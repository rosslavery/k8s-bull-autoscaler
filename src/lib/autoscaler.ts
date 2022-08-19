import * as k8s from '@kubernetes/client-node';
import got from 'got';
import { AutoScalerOptions } from '../types/options.interface';

export class Autoscaler {
  private config: k8s.KubeConfig;
  private k8sApi: k8s.AppsV1Api;
  private lastScaleTime: number;
  private options: AutoScalerOptions;
  private messageCount: number = 0;
  private replicasCount: number;
  private isScaling: boolean = false;

  constructor(options: AutoScalerOptions) {
    this.config = new k8s.KubeConfig();
    this.config.loadFromCluster();
    this.k8sApi = this.config.makeApiClient(k8s.AppsV1Api);
    this.options = options;
  }

  /**
   * Initialize the autoscaler
   */
  public init() {
    console.log(
      `[init] Initializing autoscaler with options: ${JSON.stringify(
        this.options
      )}`
    );
    this.poll();
  }

  /**
   * Stores the latest message count from the configured URL
   */
  private async updateMessageCount(): Promise<void> {
    try {
      const messageCount: number = await got
        .get(this.options.queueUrl)
        .json()
        .then((body: any) => body.payload);
      console.log(`[getMessageCount] Got message count: ${messageCount}`);

      if (typeof messageCount !== 'number') {
        throw new Error(
          `Unexpected message count type. Expected number received ${typeof messageCount}`
        );
      } else {
        this.messageCount = messageCount;
      }
    } catch (err) {
      console.error(
        `[getMessageCount] Failed to get message count: ${err.message}`
      );
    }
  }

  /**
   * Stores the latest replica count from the configured deployment
   */
  private async updateReplicasCount(): Promise<void> {
    const deployment = await this.getDeployment();
    this.replicasCount = deployment.spec.replicas;
  }

  /**
   * Polls message count and replica count to scale as needed
   */
  private async poll() {
    await this.updateReplicasCount();

    setInterval(
      () => this.updateReplicasCount(),
      this.options.deploymentPollPeriod || 60000
    );

    setInterval(async () => {
      await this.updateMessageCount();
      await this.scale();
    }, this.options.pollPeriod || 20000);
  }

  /**
   * Scales the deployment to a new replica count if needed
   */
  private async scale(): Promise<void> {
    if (!this.isScaling) {
      const now = new Date().getTime();

      if (
        !this.lastScaleTime ||
        now - this.lastScaleTime > this.options.scaleWait
      ) {
        const newReplicas = this.calculateReplicas();

        if (newReplicas !== this.replicasCount) {
          const deployment = await this.getDeployment();

          if (deployment) {
            if (deployment.spec.replicas !== newReplicas) {
              try {
                this.isScaling = true;
                const oldReplicas = deployment.spec.replicas;

                console.log(
                  `[scale] Trying to scale from ${oldReplicas} to ${newReplicas}`
                );

                deployment.spec.replicas = newReplicas;
                await this.updateDeployment(deployment);
                this.replicasCount = newReplicas;
                this.lastScaleTime = new Date().getTime();

                console.log(
                  `[scale] Scaled from ${oldReplicas} to ${newReplicas}`
                );
              } finally {
                this.isScaling = false;
              }
            }
          }
        }
      } else {
        console.log(`[scale] Skipping scale check due to scaleWait time`);
      }
    } else {
      console.log(
        `[scale] Skipping scale check due to scale already in progress`
      );
    }
  }

  /**
   * Calculate the new replica count to be used based on the
   * number of messages and messages per pod
   *
   * @returns New replica count to be checked before scaling
   */
  private calculateReplicasByMessages(): number {
    return Math.ceil(this.messageCount / this.options.messagesPerPod);
  }

  /**
   * Calculate the final replica count to be used by the scale function
   * Decides whether the existing replica count is sufficient based on
   * min/max pod configuration options.
   *
   * @returns The new replica count to be used by scale if needed
   */
  private calculateReplicas(): number {
    const newReplicas = this.calculateReplicasByMessages();

    if (newReplicas !== this.replicasCount) {
      if (
        newReplicas >= this.options.minPods ||
        newReplicas <= this.options.maxPods
      ) {
        console.log(`[getScaleCount] Returning newReplicas: ${newReplicas}`);
        return newReplicas;
      } else {
        console.log(
          `[getScaleCount] Reached min/max pods. Returning replicasCount - replicasCount ${this.replicasCount} - newReplicas ${newReplicas} - minPods ${this.options.minPods} - maxPods ${this.options.maxPods}`
        );
        return this.replicasCount;
      }
    } else {
      console.log(
        `[getScaleCount] Unchanged, returning replicasCount: ${this.replicasCount}`
      );
      return this.replicasCount;
    }
  }

  /**
   * Get the configured deployment's current state
   *
   * @returns The current state of the configure deployment
   */
  private async getDeployment(): Promise<k8s.V1Deployment> {
    try {
      const deployment = await this.k8sApi
        .readNamespacedDeployment(
          this.options.k8sDeployment,
          this.options.k8sNamespace
        )
        .then((response) => response.body);
      console.log(
        `[getDeployment] Got deployment: ${JSON.stringify(deployment)}`
      );
      return deployment;
    } catch (err) {
      console.error(
        `[getDeployment] Error getting deployment: ${JSON.stringify(err)}`
      );
      return null;
    }
  }

  /**
   * Replace the existing deployment with the mutated version containing
   * the updated replicas count
   *
   * @param deployment The mutated deployment to replace the old one
   */
  private async updateDeployment(deployment: k8s.V1Deployment): Promise<void> {
    try {
      const updateResponse = await this.k8sApi.replaceNamespacedDeployment(
        this.options.k8sDeployment,
        this.options.k8sNamespace,
        deployment
      );
      console.log(
        `[updateDeployment] Deployment updated. Response: ${JSON.stringify(
          updateResponse
        )}`
      );
    } catch (err) {
      console.error(
        `[updateDeployment] Failed to update deployment: ${JSON.stringify(err)}`
      );
    }
  }
}
