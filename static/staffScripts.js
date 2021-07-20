var guests = []
var tasks = []

function openSocket() {
    var socket = new WebSocket(((window.location.protocol === "https:") ? "wss://" : "ws://") + window.location.host + "/staffWS");
    socket.onopen = function onConnect() {
        console.log("Connected!")
    }
    socket.onmessage = function onMessage(event) {
        let obj = JSON.parse(event.data)
        console.log(obj)
    }
    socket.onclose = function reconnect(event) {
        console.log(`Socket closed at: ${new Date().toString()}. Attempting to reconnect. Reason for closing is:`)
        console.log(event.reason)
        setTimeout(openSocket, 1000)
    }
}

$(document).ready(() => {
    openSocket()
    $("#swipeArea").keypress((evt) => {
        if (e.which == 13) {
            console.log($("#swipeArea").val())
        }
    })
})