function submit() {

    //Check for a valid email. Presence of an @ sign is pretty much the only thing that doesn't have edge cases where it gives a false negative
    if (!$("#emailInput").val().includes('@')) {
        alert("An email address is required to match you to your account!")
        $("#emailInput")[0].scrollIntoView()
        return
    }

    //Keep track of the score
    let score = 0
    let forms = $("form")
    //For each question
    for (let i in data.questions) {
        //Get the DOM elements
        let question = forms.eq(parseInt(i))
        let answers = question.find("input")
        //Keeps track of whether the question is answered, and if it's correct
        let correct = true //Defaults to true, goes to false if any answer is incorrect (true and not checked, or false and checked)
        let answered = false //Defaults to false for each question, goes to true if any answer has been checked
        //For each answer
        for (let j in data.questions[i].answers) {
            //Get the DOM
            let answer = answers.eq(parseInt(j))
            //See if it's answered
            if (answer.prop("checked")) {
                answered = true
            }
            //See if any answers are wrong
            if (answer.prop("checked") && !data.questions[i].answers[j].correct) {
                correct = false
            } else if (!answer.prop("checked") && data.questions[i].answers[j].correct) {
                correct = false
            }
        }
        //Alert the user if this question hasn't been answered
        if (!answered) {
            alert("You haven't answered one or more question(s)")
            question[0].scrollIntoView()
            return
        }
        //If this question is correct, add to the score
        if (correct) {
            score++
        }
    }

    //If 100%
    if (score == data.questions.length) {
        //Send the request to add the cert to the server
        $.post(`/quiz/${data.quizId}/submit`, JSON.stringify({
            email: $("#emailInput").val()
        })).done((dat, status, xhr) => {
            //Error handling, we should ALWAYS get 200
            if (xhr.status != 200) {
                console.error(dat)
                console.error(status)
                console.error(xhr)
                alert("Something went wrong when submitting your answers. Please try again later. If this problem persists, please let us know at the shop!")
                return
            }
            //Replace the entire body with text saying whether they're right or not
            let header = $("#body:nth-child(1)")
            $("#body").empty()
            $("#body").append(header)
            $("#body").append(`<p>You got a score of ${score} out of ${data.questions.length}. A 100% is required to pass.</p><br/>`)
            $("#body").append(`<p>Congratulations!</p>`)
        }).fail((dat, status, xhr) => {
            //Handle the case where the email doesn't match anyone
            if (dat.responseText == "No such user") {
                alert("That email does not match any current account. Please check that you've registered and that your email matches.")
                return
            }
            //Handle other cases
            console.error(dat)
            console.error(status)
            console.error(xhr)
            alert("Something went wrong when submitting your answers. Please try again later. If this problem persists, please let us know at the shop!")
            return
        })
    } else {
        //If any answer is wrong, clear the page and show them the sad body
        let header = $("#body:nth-child(1)")
        $("#body").empty()
        $("#body").append(header)
        $("#body").append(`<p>You got a score of ${score} out of ${data.questions.length}. A 100% is required to pass.</p><br/>`)
        $("#body").append(`<p>You can retry this quiz as many times as you need to pass.</p><br/><button class="btn btn-primary" onclick="window.location.reload()">Retry</button>`)
    }
}

//Secret function that makes every answer correct, so that I don't spend 20 minutes every time I want to test
function makeRight() {
    let forms = $("form")
    for (let i in data.questions) {
        let question = forms.eq(parseInt(i))
        let answers = question.find("input")
        for (let j in data.questions[i].answers) {
            let answer = answers.eq(parseInt(j))
            if (data.questions[i].answers[j].correct) {
                answer.prop("checked", true)
            } else {
                answer.prop("checked", false)
            }
        }
    }
}