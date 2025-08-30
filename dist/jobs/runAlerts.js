"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAlertsOnce = void 0;
// Simple pass-through so other modules can import from './jobs/runAlerts'
var alertsRunner_1 = require("./alertsRunner");
Object.defineProperty(exports, "runAlertsOnce", { enumerable: true, get: function () { return alertsRunner_1.runAlertsOnce; } });
const alertsRunner_2 = require("./alertsRunner");
exports.default = alertsRunner_2.runAlertsOnce;
