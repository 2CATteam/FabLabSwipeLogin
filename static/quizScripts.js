function submit() {
    let score = 0
    let forms = $("form")
    for (let i in data.questions) {
        let question = forms.eq(parseInt(i))
        let correct = true
        let answers = question.find("input")
        for (let j in data.questions[i].answers) {
            let answer = answers.eq(parseInt(j))
            if (answer.prop("checked") && !data.questions[i].answers[j].correct) {
                correct = false
            } else if (!answer.prop("checked") && data.questions[i].answers[j].correct) {
                correct = false
            }
        }
        if (correct) {
            score++
        }
    }
    if (score == data.questions.length) {
        alert("Great job! You passed!")
    } else {
        alert(`Your score was ${score} out of ${data.questions.length}`)
    }
}