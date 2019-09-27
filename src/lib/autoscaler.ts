import * as got from 'got';

import * as KubeAPI from 'kubernetes-client';

const Client = KubeAPI.Client1_13;
const config = KubeAPI.config;

export class Autoscaler {
  private k8sApi = new Client({ config: config.getInCluster() });
  private lastScaleUpTime = new Date().getTime();
  private lastScaleDownTime = new Date().getTime();
  private options: { [key: string]: any };
  private messageCount: number = 0;

  constructor(options: { [key: string]: any }) {
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
        .get(this.options.queueUrl, { json: true })
        .then(response => response.body.payload);
    } catch (err) {
      console.error(`Failed to get message count: ${err.message}`);
      return null;
    }
  }

  private poll() {
    setInterval(async () => {
      this.messageCount = await this.getMessageCount();

      if (typeof this.messageCount === 'number') {
        const now = new Date().getTime();

        if (this.messageCount >= this.options.messagesPerPod) {
          if (now - this.lastScaleUpTime > this.options.scaleUpWait) {
            await this.scaleUp();
            this.lastScaleUpTime = now;
          } else {
            console.log('Waiting for scale up cooldown');
          }
        }

        if (this.messageCount <= this.options.messagesPerPod) {
          if (now - this.lastScaleDownTime > this.options.scaleDownWait) {
            await this.scaleDown();
            this.lastScaleDownTime = now;
          } else {
            console.log('Waiting for scale down cooldown');
          }
        }
      }
    }, this.options.pollPeriod || 20000);
  }

  private async scaleUp() {
    const deployment = await this.getDeployment();

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
      } else if (deployment.spec.replicas > this.options.maxPods) {
        await this.scaleDown();
      } else {
        console.log('Max pods reached');
      }
    }
  }

  private async scaleDown() {
    const deployment = await this.getDeployment();

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
      } else if (deployment.spec.replicas < this.options.minPods) {
        await this.scaleUp();
      } else {
        console.log('Min pods reached');
      }
    }
  }

  private async getDeployment() {
    try {
      console.log('Getting deployment');
      const deploymentResponse = await this.k8sApi.apis.apps.v1
        .namespaces(this.options.k8sNamespace)
        .deployments(this.options.k8sDeployment)
        .get();
      return deploymentResponse.body;
    } catch (err) {
      console.error(`Failed to get deployment: ${JSON.stringify(err)}`);
      return null;
    }
  }

  private async updateDeployment(deployment: any) {
    try {
      console.log('Updating deployment');
      const updateResponse = await this.k8sApi.apis.apps.v1
        .namespaces(this.options.k8sNamespace)
        .deployments(this.options.k8sDeployment)
        .patch({ body: deployment });
      console.log(
        `Deployment updated. Response: ${JSON.stringify(updateResponse)}`
      );
    } catch (err) {
      console.error(`Failed to update deployment: ${JSON.stringify(err)}`);
    }
  }
}
