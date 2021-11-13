const nodemailer = require('nodemailer')
const auth = require("./emailAuth.js")

module.exports = class Emailer {
    constructor() {
        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: auth
        })
    }

    async sendMessage(recipient, title, body) {
        let info = await this.transporter.sendMail({
            from: auth.user,
            to: recipient,
            subject: title,
            text: body
        })

        console.log(info)
    }
}