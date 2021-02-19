#!/usr/bin/env node

import commander from 'commander';

import { Autoscaler } from './lib/autoscaler';
import { AutoScalerOptions } from './types/options.interface';

const commanderParseInt = (value: string) => {
  return parseInt(value, 10);
};

const program = commander
  .requiredOption('--queue-url <url>', 'Queue Count URL')
  .requiredOption('--k8s-deployment <deployment>', 'Kubernetes Deployment Name')
  .requiredOption(
    '--k8s-namespace <namespace>',
    'Kubernetes Namespace',
    'default'
  )
  .option(
    '--poll-period <time>',
    'How often to poll the queue',
    commanderParseInt,
    10000
  )
  .option(
    '--scale-wait <time>',
    'Time to wait between scaling attempts',
    commanderParseInt,
    10000
  )
  .option(
    '--messages-per-pod <count>',
    'Number of messages per worker',
    commanderParseInt,
    50
  )
  .option(
    '--max-pods <count>',
    'Maximum number of worker pods',
    commanderParseInt,
    10
  )
  .option(
    '--min-pods <count>',
    'Minimum number of worker pods',
    commanderParseInt,
    1
  );

const options = program.parse(process.argv).opts() as AutoScalerOptions;

new Autoscaler(options).init();
