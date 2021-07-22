function signIn(id) {
    $.post("/signin", JSON.stringify({ type: "swipe", id: id }))
        .done((data, status, xhr) => {
            console.log(data)
            console.log(status)
            console.log(xhr)
            if (xhr.status == 202) {
                showRegistration(id)
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
    $("#registrationModal").modal('show')
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
                $("#registrationModal").modal('hide')
            }
        })
        .fail((data, status, xhr) => {
            console.error(data)
            console.error(status)
            console.error(xhr)
        }
    )
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
})