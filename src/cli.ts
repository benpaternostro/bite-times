#!/usr/bin/env node
import { runCli } from "./cli-run";

const { exitCode, output } = runCli(process.argv.slice(2));
if (exitCode === 0) {
  console.log(output);
} else {
  console.error(output);
}
process.exit(exitCode);
