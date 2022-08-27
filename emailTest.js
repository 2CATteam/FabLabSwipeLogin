let emailer = require("./lib/emailTools.js")

let client = new emailer()
client.sendMessage("2CATteam@gmail.com", "You suck", "<h1>Haha you are bad</h1>").then(() => {
	console.log("Done!")
})
