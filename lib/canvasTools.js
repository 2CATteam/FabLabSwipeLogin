//Simple require stack, good on me for so few dependencies
const canvasInfo = require("./canvasInfo.js")
const axios = require('axios')

//I forgot to make this a class until afterwards, so I'm just exporting each function manually. I suck
module.exports = {
    enrollUser: enrollUser,
    createUser: createUser,
    checkCerts: checkCerts,
    messageUser: messageUser,
    getQuizData: getQuizData
}

//Template for all requests
const instance = axios.create({
    baseURL: 'https://canvas.ou.edu',
    headers: {
        "authorization": "Bearer " + canvasInfo.api_token,
        "content-type": "application/json; charset=UTF-8",
        "x-csrf-token": canvasInfo.api_token,
        "Accept": "application/json+canvas-string-ids"
    },
    timeout: 30000
})

//Enroll a user in the course and returns the user ID
function enrollUser(ouid, email, name) {
    return new Promise((res, rej) => {
        //Send the post request to the enrollment endpoint
        instance.post(`/api/v1/courses/248391/enrollments`, {
            enrollment: {
                user_id: `sis_user_id:${ouid}`,
                type: "StudentEnrollment",
                self_enrolled: true,
                enrollment_state: "active"
            }
        }).then((response) => {
            console.log(response.data)
            //Send a message to the user
            messageUser(response.data.user_id, "Welcome to our Canvas course!", `Welcome to the Tom Love Innovation Hub Fabrication Lab!

You’ve now been enrolled in a canvas course titled ‘Shop Fundamentals’ that you can access by signing into canvas just like you do for your other courses. This canvas course holds the training videos and quizzes for access to using Fab Lab equipment.

Keep in mind, before you’ll be allowed to use any of our tools, in addition to the respective trainings, you’ll have to complete our Fab Lab Culture Quiz, which is just a mechanism for making sure you’re aware of how to engage with the shop. It’ll take you all of three minutes – maybe.

This new method of training and keeping up with access is a huge undertaking on our end, so we’re thankful for your patience and feedback! It is new and complex, and again, your insight is helpful; If you run into new issues or challenges, please let us know.

If you have any questions or comments, please email us at:

fablab@ou.edu`).catch(console.error)
            //Return the user ID
            res(response.data.user_id)
        }).catch((err) => {
            //Error handling - return null value for known errors
            if (err?.response?.data?.errors?.[0].message == "The specified resource does not exist.") {
                res(null)
                /*
                createUser(email, name).then((response) => {
                    res(response)
                }).catch((err) => {
                    console.error("Failed to create account")
                    rej(err)
                })*/
            } else {
                console.error(err.response.data)
            }
        })
    })
}

//Create a user. Doesn't work, don't use. It makes a Canvas account for non-OU people, and they don't like that
function createUser(email, name) {
    return new Promise((res, rej) => {
        //This API endpoint doesn't work with our authentication method
        instance.post(`/courses/${canvasInfo.course_id}/invite_users`, {
            users: [{
                name: name,
                email: email
            }]
        }).then((response) => {
            res(response.data)
        }).catch((err) => {
            rej(err.response.status)
        })
    })
}

//Get certifications for a given group of students and a reference certification set. Returns an object mapping IDs to certifications
function checkCerts(studentIds, certs) {
    return new Promise((res, rej) => {
        //Get the grades for these students
        instance.get(`/api/v1/courses/${canvasInfo.course_id}/students/submissions`, {
            params: {
                student_ids: studentIds,
                grouped: true
            }
        }).then((response) => {
            //Make an object to return
            let toReturn = {}
            //For each student in the response
            for (let i in response.data) {
                //Initialize the certs they should have to none
                let certsHave = 0
                //For each assignment
                for (let j in response.data[i].submissions) {
                    //Find the matching certification
                    for (let k in certs) {
                        if (certs[k].quizId === response.data[i].submissions[j].assignment_id) {
                            //If they passed, add that cert to their list of completed certs
                            if (response.data[i].submissions[j].score >= certs[k].passingScore) {
                                certsHave |= 1 << certs[k].id
                                //console.log(response.data[i].submissions[j].user_id, "passed quiz for", certs[k].name)
                            }
                            break
                        }
                    }
                }
                //Save the certs had
                toReturn[response.data[i].user_id] = certsHave
            }
            //Return the object containing all the stuff
            res(toReturn)
        }).catch((err) => {
            //Error handling
            rej(err.response.data)
        })
    })
}

//Send a message to a user
function messageUser(canvasId, title, body) {
    return new Promise((res, rej) => {
        instance.post(`/api/v1/conversations`, {
            recipients: [canvasId],
            subject: title,
            body: body,
            mode: "sync"
        }).then((response) => {
            res(response.data)
        }).catch((err) => {
            rej(err.response.data)
        })
    })
}

function getQuizData(quizId) {
    return new Promise((res, rej) => {
        instance.get(`/api/v1/courses/${canvasInfo.course_id}/quizzes/${quizId}`).then(async (response) => {
            let toReturn = {}
            toReturn.title = response.data.title
            toReturn.description = response.data.description
            toReturn.quizId = quizId
            toReturn.questions = await getQuizQuestions(quizId)
            res(toReturn)
        }).catch((err) => {
            return rej(err)
        })
    })
}

function getQuizQuestions(quizId) {
    return new Promise((res, rej) => {
        instance.get(`/api/v1/courses/${canvasInfo.course_id}/quizzes/${quizId}/questions`).then((response) => {
            let toReturn = []
            console.log(response.data)
            for (let i in response.data) {
                let toAdd = {}
                toAdd.question = response.data[i].question_text
                toAdd.type = response.data[i].question_type
                toAdd.answers = []
                for (let j in response.data[i].answers) {
                    toAdd.answers.push({text: response.data[i].answers[j].text, correct: response.data[i].answers[j].weight > 0})
                }
                toReturn.push(toAdd)
            }
            return res(toReturn)
        }).catch((err) => {
            return rej(err)
        })
    })
}
