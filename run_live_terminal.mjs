import fs from 'node:fs';
import { execSync } from 'node:child_process';

process.loadEnvFile('.env');
let apiKey = process.env.CONSOLE_API_KEY;
if (process.env.CONSOLE_CREDENTIAL_BUNDLE) {
  apiKey = JSON.parse(process.env.CONSOLE_CREDENTIAL_BUNDLE).apiKey;
}

const defaultBucketId = 'ec7acd16-05b1-4fa2-b368-94700eb29f5e';

function run(cmdDisplay, actualCmd) {
  console.log(`PS D:\\Personal Portfolio\\WALRUS Console> ${cmdDisplay}`);
  try {
    const out = execSync(actualCmd, { encoding: 'utf8' });
    process.stdout.write(out);
  } catch (e) {
    if (e.stdout) process.stdout.write(e.stdout);
    if (e.stderr) process.stderr.write(e.stderr);
  }
  console.log();
}

console.log('Windows PowerShell');
console.log('Copyright (C) Microsoft Corporation. All rights reserved.\n');

run(
  'curl.exe -i -s -H "Authorization: Bearer [REDACTED]" https://api.console.walrus.xyz/api/v1/buckets/not-a-uuid',
  `curl.exe -i -s -H "Authorization: Bearer ${apiKey}" https://api.console.walrus.xyz/api/v1/buckets/not-a-uuid`
);

run(
  'curl.exe -i -s -H "Authorization: Bearer [REDACTED]" https://api.console.walrus.xyz/api/v1/buckets/00000000-0000-0000-0000-000000000000',
  `curl.exe -i -s -H "Authorization: Bearer ${apiKey}" https://api.console.walrus.xyz/api/v1/buckets/00000000-0000-0000-0000-000000000000`
);

run(
  `curl.exe -i -s -H "Authorization: Bearer [REDACTED]" "https://api.console.walrus.xyz/api/v1/buckets/${defaultBucketId}/files?q=%00"`,
  `curl.exe -i -s -H "Authorization: Bearer ${apiKey}" "https://api.console.walrus.xyz/api/v1/buckets/${defaultBucketId}/files?q=%00"`
);

console.log('PS D:\\Personal Portfolio\\WALRUS Console> _');
