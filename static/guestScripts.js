function signIn(id) {
    $.post("/signin", JSON.stringify({ type: "swipe", id: id }))
        .done((data, status, xhr) => {
            console.log(data)
            console.log(status)
            console.log(xhr)
            if (xhr.status == 202) {
                showRegistration(id)
            } else if (xhr.status == 200) {
                window.scrollTo({left: window.innerWidth * 3, top: 0, behavior: "smooth"})
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
    window.scrollTo({left: window.innerWidth, top: 0, behavior: "smooth"})
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
                window.scrollTo({left: 0, top: 0, behavior: "smooth"})
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
    $("#swipeArea").focus()
    window.scrollTo({left: window.innerWidth * 2, top: 0, behavior: "smooth"})
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
    window.scrollTo({left: window.innerWidth * 2, top: 0, behavior: "instant"})
})