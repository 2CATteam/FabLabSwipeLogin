function signIn(id) {
    $.post("/signin", JSON.stringify({ type: "swipe", id: id }))
        .done((data, status, xhr) => {
            console.log(data)
            console.log(status)
            console.log(xhr)
            if (xhr.status == 202) {
                showRegistration(id)
            } else if (xhr.status == 200) {
                $("#signInText").text(data.message === "Hello!" ? "Welcome back!" : "Goodbye!")
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
    if (!(
        $("#IDInput").val() &&
        $("#NameInput").val() &&
        $("#EmailInput").val()
    )) return false
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
                console.log("Hey we registered")
                $("#signInText").text("Welcome!")
                window.scrollTo({left: window.innerWidth * 3, top: 0, behavior: "smooth"})
                setTimeout(showHome, 2000)
            }
            setTimeout(() => {
                $("#IDInput").val("")
                $("#NameInput").val("")
                $("#EmailInput").val("")
                $("#registrationForm")[0].reset()
                $("#registrationForm").removeClass("was-validated")
            }, 2000)
        })
        .fail((data, status, xhr) => {
            console.error(data)
            console.error(status)
            console.error(xhr)
        }
    )
    return false
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
    
    https://getbootstrap.com/docs/5.0/forms/validation/
    // Fetch all the forms we want to apply custom Bootstrap validation styles to
    var forms = document.querySelectorAll('.needs-validation')
    
    // Loop over them and prevent submission
    Array.prototype.slice.call(forms)
        .forEach(function (form) {
        form.addEventListener('submit', function (event) {
            event.preventDefault()
            event.stopPropagation()
    
            form.classList.add('was-validated')
        }, false)
        })
    window.scrollTo({left: window.innerWidth * 2, top: 0, behavior: "instant"})
})