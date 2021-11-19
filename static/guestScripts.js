//Calls the Sign in API endpoint
function signIn(id) {
    $.post("/signin", JSON.stringify({ type: "swipe", id: id }))
        .done((data, status, xhr) => {
            console.log(data)
            console.log(status)
            console.log(xhr)
            //If the status code says to register, show that screen
            if (xhr.status == 202) {
                showRegistration(id)
            //If the status code says it worked, show that text and then show home
            } else if (xhr.status == 200) {
                $("#signInText").text(data.message === "Hello!" ? "Welcome back!" : "Goodbye!")
                window.scrollTo({left: window.innerWidth * 3, top: 0, behavior: "smooth"})
                setTimeout(showHome, 2000)
            } else {
                console.log(xhr.status)
            }
        })
        //Error handling
        .fail((data, status, xhr) => {
            console.error(data)
            console.error(status)
            console.error(xhr)
        }
    )
}

//Show the registration page
function showRegistration(id) {
    //Set the inputs properly and focus the keyboard
    $("#IDInput").val(id ? id : "")
    $("#NameInput").val("")
    $("#EmailInput").val("")
    $("#NameInput").focus()
    //Move to that page
    window.scrollTo({left: window.innerWidth, top: 0, behavior: "smooth"})
}

//Register a user
function register() {
    //Validation
    if (!(
        $("#IDInput").val() &&
        $("#NameInput").val() &&
        $("#EmailInput").val()
    )) return false
    if (!($("#EmailInput").val().includes("@"))) {
        $("#EmailInput")[0].setCustomValidity("is-invalid")
        return
    }
    //Send to the endpoint
    $.post("/signin", JSON.stringify({
        type: "register",
        id: $("#IDInput").val(),
        name: $("#NameInput").val(),
        email: $("#EmailInput").val()
    }))
        .done((data, status, xhr) => {
            console.log("Registration finished, maybe not failed")
            console.log(data)
            console.log(status)
            console.log(xhr)
            //When successful, show the success screen then show home
            if (data.message == "Registered and logged in") {
                console.log("Hey we registered")
                $("#signInText").text("Welcome!")
                window.scrollTo({left: 0, top: 0, behavior: "smooth"})
                setTimeout(showHome, 2000)
            }
            //After two seconds, remove validation and clear values
            setTimeout(() => {
                $("#IDInput").val("")
                $("#NameInput").val("")
                $("#EmailInput").val("")
                $("#registrationForm")[0].reset()
                $("#registrationForm").removeClass("was-validated")
            }, 2000)
        })
        //Error handling
        .fail((data, status, xhr) => {
            console.error("Registration failed")
            console.error(data)
            console.error(status)
            console.error(xhr)
        }
    )
    return false
}

//Show the home screen
function showHome() {
    //Focus the swipe text input
    $("#swipeArea").focus()
    //Scroll to the home screen
    window.scrollTo({left: window.innerWidth * 2, top: 0, behavior: "smooth"})
}

//On ready
$(document).ready(() => {
    //When the Swipe Area hits enter, match that against a regex to extract from a SoonerCard and then send the resulting ID to the signIn function
    $("#swipeArea").keypress((evt) => {
        if (evt.which == 13) {
            let data = $("#swipeArea").val()
            console.log(data)
            $("#swipeArea").val("")
            let match = data.match(/;(\d{15,16})\??/)
            if (match) {
                data = match[1].substring(5, 14)
            }
            signIn(data)
            console.log(data)
        }
    })
    //Start focusing on the Swipe Area
    $("#swipeArea").focus()
    
    // https://getbootstrap.com/docs/5.0/forms/validation/
    // Fetch all the forms we want to apply custom Bootstrap validation styles to
    var forms = document.querySelectorAll('.needs-validation')
    
    // Loop over them and prevent submission when validation happens
    Array.prototype.slice.call(forms)
        .forEach(function (form) {
            form.addEventListener('submit', function (event) {
                $("#EmailInput")[0].setCustomValidity("")
                event.preventDefault()
                if (!form.checkValidity()) {
                    event.stopPropagation()
                } else {
                    register()
                }
        
                form.classList.add('was-validated')
            }, false)
        })
    //Go to the home screen
    window.scrollTo({left: window.innerWidth * 2, top: 0, behavior: "instant"})
})