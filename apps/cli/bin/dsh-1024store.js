#!/usr/bin/env node

import { main } from '../src/index.js'

const exitCode = await main(process.argv.slice(2))
process.exitCode = exitCode
