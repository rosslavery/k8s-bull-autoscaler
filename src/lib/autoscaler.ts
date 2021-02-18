import * as k8s from '@kubernetes/client-node';
import got from 'got';

export class Autoscaler {
  private config: k8s.KubeConfig;
  private k8sApi: k8s.AppsV1Api;
  private lastScaleUpTime: number;
  private lastScaleDownTime: number;
  private options: { [key: string]: any };
  private messageCount: number = 0;
  private replicasCount: number;

  constructor(options: { [key: string]: any }) {
    this.config = new k8s.KubeConfig();
    this.config.loadFromCluster();
    this.k8sApi = this.config.makeApiClient(k8s.AppsV1Api);
    this.options = options;
  }

  public init() {
    console.log(
      `Initializing autoscaler with options: ${JSON.stringify(this.options)}`
    );
    this.poll();
  }

  private async getMessageCount(): Promise<number> {
    try {
      return await got
        .get(this.options.queueUrl)
        .json()
        .then((body: any) => body.payload);
    } catch (err) {
      console.error(`Failed to get message count: ${err.message}`);
      return null;
    }
  }

  private async getReplicasCount(): Promise<number> {
    const deployment = await this.getDeployment();

    return deployment.spec.replicas;
  }

  private async updateReplicasCount(): Promise<void> {
    this.replicasCount = await this.getReplicasCount();
  }

  private async poll() {
    await this.updateReplicasCount();

    setInterval(() => this.updateReplicasCount(), 60000);

    setInterval(async () => {
      this.messageCount = await this.getMessageCount();

      if (typeof this.messageCount === 'number') {
        const now = new Date().getTime();

        if (
          this.messageCount >= this.options.messagesPerPod ||
          (this.messageCount && this.replicasCount === 0)
        ) {
          if (
            !this.lastScaleUpTime ||
            now - this.lastScaleUpTime > this.options.scaleUpWait
          ) {
            await this.scaleUp();
          } else {
            console.log('Waiting for scale up cooldown');
          }

          return;
        }

        if (
          (this.messageCount <= this.options.messagesPerPod &&
            this.options.minPods > 0) ||
          (!this.messageCount && this.replicasCount > 0)
        ) {
          if (
            !this.lastScaleDownTime ||
            now - this.lastScaleDownTime > this.options.scaleDownWait
          ) {
            await this.scaleDown();
          } else {
            console.log('Waiting for scale down cooldown');
          }

          return;
        }
      }
    }, this.options.pollPeriod || 20000);
  }

  private async scaleUp(): Promise<void> {
    const deployment = await this.getDeployment();
    const now = new Date().getTime();

    if (deployment) {
      if (deployment.spec.replicas < this.options.maxPods) {
        let newReplicas = Math.ceil(
          this.messageCount / this.options.messagesPerPod
        );

        if (newReplicas > this.options.maxPods) {
          newReplicas = this.options.maxPods;
        }

        console.log('Scaling up');
        deployment.spec.replicas = newReplicas;
        await this.updateDeployment(deployment);

        this.replicasCount = newReplicas;
        this.lastScaleUpTime = now;
        this.lastScaleDownTime = null;
      } else if (deployment.spec.replicas > this.options.maxPods) {
        await this.scaleDown();
      } else {
        console.log('Max pods reached');
      }
    }
  }

  private async scaleDown(): Promise<void> {
    const deployment = await this.getDeployment();
    const now = new Date().getTime();

    if (deployment) {
      if (deployment.spec.replicas > this.options.minPods) {
        let newReplicas = Math.ceil(
          this.messageCount / this.options.messagesPerPod
        );

        if (newReplicas < this.options.minPods) {
          newReplicas = this.options.minPods;
        }

        console.log('Scaling down');
        deployment.spec.replicas = newReplicas;
        await this.updateDeployment(deployment);

        this.replicasCount = newReplicas;
        this.lastScaleDownTime = now;
        this.lastScaleUpTime = null;
      } else if (deployment.spec.replicas < this.options.minPods) {
        await this.scaleUp();
      } else {
        console.log('Min pods reached');
      }
    }
  }

  private async getDeployment(): Promise<k8s.V1Deployment> {
    try {
      console.log('Getting deployment');
      const deploymentResponse = await this.k8sApi.readNamespacedDeployment(
        this.options.k8sDeployment,
        this.options.k8sNamespace
      );
      return deploymentResponse.body;
    } catch (err) {
      return null;
    }
  }

  private async updateDeployment(deployment: k8s.V1Deployment): Promise<void> {
    try {
      console.log('Updating deployment');
      const updateResponse = await this.k8sApi.replaceNamespacedDeployment(
        this.options.k8sDeployment,
        this.options.k8sNamespace,
        deployment
      );
      console.log(
        `Deployment updated. Response: ${JSON.stringify(updateResponse)}`
      );
    } catch (err) {
      console.error(`Failed to update deployment: ${JSON.stringify(err)}`);
    }
  }
}
