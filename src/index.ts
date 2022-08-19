#!/usr/bin/env node

import { program } from 'commander';

import { Autoscaler } from './lib/autoscaler';
import { AutoScalerOptions } from './types/options.interface';

const commanderParseInt = (value: string) => {
  return parseInt(value, 10);
};

const cli = program
  .requiredOption('--queue-url <url>', 'Queue Count URL')
  .requiredOption('--k8s-deployment <deployment>', 'Kubernetes Deployment Name')
  .requiredOption(
    '--k8s-namespace <namespace>',
    'Kubernetes Namespace',
    'default'
  )
  .option(
    '--poll-period <time>',
    'How often to poll the queue for the message count',
    commanderParseInt,
    20000
  )
  .option(
    '--deployment-poll-period <time>',
    'How often to poll the configured deployment for replicas',
    commanderParseInt,
    60000
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

const options = cli.parse(process.argv).opts<AutoScalerOptions>();

new Autoscaler(options).init();
