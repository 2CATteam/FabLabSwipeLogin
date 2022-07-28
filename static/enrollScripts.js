//Register a user
function register() {
    //Validation
    if (!(
        $("#IDInput").val() &&
        $("#NameInput").val() &&
        $("#EmailInput").val()
    )) return false
    //Send to the endpoint
    $.post("/signin", JSON.stringify({
        type: "register",
        id: $("#IDInput").val(),
        name: $("#NameInput").val(),
        email: $("#EmailInput").val(),
        signin: false
    }))
        .done((data, status, xhr) => {
            console.log("Registration finished, maybe not failed")
            console.log(data)
            console.log(status)
            console.log(xhr)
            //When successful, show the success screen then show home
            if (data.message == "Registered and logged in") {
                console.log("Hey we registered")
                alert($("#welcomeText").text())
            }
            //Remove validation and clear values
            $("#IDInput").val("")
            $("#NameInput").val("")
            $("#EmailInput").val("")
            $("#registrationForm")[0].reset()
            $("#registrationForm").removeClass("was-validated")
        })
        //Error handling
        .fail((data, status, xhr) => {
            console.error("Registration failed")
            console.error(data)
            console.error(status)
            console.error(xhr)
            if (data.responseJSON.message == "User already exists") {
                alert("Looks like you're already registered. If you're not in the Shop Fundamentals Canvas course already, please email us at fablab@ou.edu")
            } else {
                alert("Registration failed, please check your input and try again")
            }
        }
    )
    return false
}

function showModal() {
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
    $("#waiverModal").modal("show")
}

//On ready
$(document).ready(() => {
    //Start focusing on the Swipe Area
    $("#IDInput").focus()
    
    https://getbootstrap.com/docs/5.0/forms/validation/
    // Fetch all the forms we want to apply custom Bootstrap validation styles to
    var forms = document.querySelectorAll('.needs-validation')
    
    // Loop over them and prevent submission when validation happens
    Array.prototype.slice.call(forms)
        .forEach(function (form) {
            form.addEventListener('submit', function (event) {
                event.preventDefault()
                if (!form.checkValidity()) {
                    event.stopPropagation()
                } else {
                    showModal()
                }
        
                form.classList.add('was-validated')
            }, false)
        })
})