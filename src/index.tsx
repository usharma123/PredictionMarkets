#!/usr/bin/env bun

import { render } from "@opentui/solid"
import { config } from "dotenv"
import { App } from "./app"

// Load environment variables
config()

// Render the app
render(() => <App />)
