function signIn(id) {
    $.post("/signin", JSON.stringify({ type: "swipe", id: id }))
        .done((data, status, xhr) => {
            console.log(data)
            console.log(status)
            console.log(xhr)
            if (xhr.status == 202) {
                showRegistration(id)
            } else if (xhr.status == 200) {
                window.scrollTo(window.innerWidth * 3, 0)
                setTimeout(showHome, 2000)
            } else {
                console.log(xhr.status)
            }
        })
        .fail((data, status, xhr) => {
            console.error(data)
            console.error(status)
            console.error(xhr)
        }
    )
}

function showRegistration(id) {
    $("#IDInput").val(id ? id : "")
    $("#NameInput").val("")
    $("#EmailInput").val("")
    $("#NameInput").focus()
    window.scrollTo(window.innerWidth * 1, 0)
}

function register() {
    $.post("/signin", JSON.stringify({
        type: "register",
        id: $("#IDInput").val(),
        name: $("#NameInput").val(),
        email: $("#EmailInput").val()
    }))
        .done((data, status, xhr) => {
            console.log(data)
            console.log(status)
            console.log(xhr)
            if (data.message == "Registered and logged in") {
                window.scrollTo(0, 0)
                setTimeout(showHome, 4000)
            }
            $("#IDInput").val("")
            $("#NameInput").val("")
            $("#EmailInput").val("")
        })
        .fail((data, status, xhr) => {
            console.error(data)
            console.error(status)
            console.error(xhr)
        }
    )
}

function showHome() {
    window.scrollTo(window.innerWidth * 2, 0)
    $("#swipeArea").focus()
}

$(document).ready(() => {
    $("#swipeArea").keypress((evt) => {
        if (evt.which == 13) {
            let data = $("#swipeArea").val()
            console.log(data)
            $("#swipeArea").val("")
            if (data.match(/^;\d{15,16}\?$/)) {
                data = data.substring(6, 15)
            }
            signIn(data)
            console.log(data)
        }
    })
    $("#swipeArea").focus()
    window.scrollTo(window.innerWidth * 2, 0)
})