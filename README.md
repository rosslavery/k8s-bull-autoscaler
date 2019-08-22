# k8s-bull-autoscaler

CLI to autoscale k8s pods based on Bull queue size

## Example Deployment

```yaml
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: example-queue-autoscaler
spec:
  replicas: 1
  template:
    metadata:
      labels:
        app: example-queue-autoscaler
        environment: production
    spec:
      containers:
        - name: example-queue-autoscaler
          image: rosslavery/k8s-bull-autoscaler:latest
          args:
            - --queue-url=http://example-api/queues/count
            - --k8s-deployment=example-worker
            - --poll-period=10000
            - --scale-down-wait=60000
            - --scale-up-wait=60000
            - --scale-up-messages=1500
            - --scale-down-messages=300
            - --min-pods=1
            - --max-pods=5
```
