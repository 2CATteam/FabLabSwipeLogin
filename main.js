const express = require('express')
const app = express()
const path = require('path')
const https = require('https')
const cookieParser = require('cookie-parser')
const url = require('url')
const port = 3000
var favicon = require('serve-favicon');

app.use(cookieParser());
app.use(express.static(__dirname + '/views'));
app.use(favicon(__dirname + '/views/favicon.ico'));