//Saves info on each instance, including the name, db, and all of the certifications
module.exports = {
    fabLab: {
        dbName: "fabLab.db",
        certs: [
            {
                name: "Waiver",
                id: 6,
                color: "#FFFFFF"
            },
            {
                name: "Culture Quiz",
                description: "Everyone has to take this quiz; this helps you understand what our expectations are of you while you're joining us in the fabrication lab.",
                id: 7,
                color: "#00FFFF",
                quizId: "278126",
                assignmentId: "1614160",
                passingScore: 11
            },
            {
                name: "Green",
                description: "Green certifications covers many of our handtools and some simpler machines. This is your ticket into the loudroom, and to the big stuff.",
                id: 1, //The ID used for keeping track of certs. This must be a positive integer between 0 and 64.
                color: "#00FF00", //The color of the certification
                group: 1, //If put in a group, certs will be progressive
                quizId: "296056", //The ID of the quiz on Canvas
                assignmentId: "1712603", //The ID of the assignment (NOT THE SAME AS QUIZ ID) on Canvas
                passingScore: 15 //The passing score of the quiz on Canvas
            },
            {
                name: "Yellow",
                description: "Yellow includes the more dangerous wood shop tools, like saws and whatnot. You cannot be Yellow certified without completing Green certification first.",
                id: 2,
                color: "#FFFF00",
                group: 1,
                quizId: "296058",
                assignmentId: "1712611",
                passingScore: 47
            },
            {
                name: "Red",
                description: "Red certification covers the most dangerous woodshop tools, like the Lathe and the Planer and Jointer. This requires Yellow first, as well as an in-person walkthrough after the quiz.",
                id: 3,
                color: "#FF0000",
                group: 1,
                quizId: "296157",
                assignmentId: "1713334",
                passingScore: 22
            },
            {
                name: "Laser",
                description: "This grants access to the laser cutters, one of our fastest and most useful tools.",
                id: 4,
                color: "#4444FF",
                quizId: "296167",
                assignmentId: "1713379",
                passingScore: 10
            },
            {
                name: "3D Printing",
                description: "This grants access to the 3D printers, and shows you how to set up your files for them.",
                id: 5,
                color: "#BB00FF",
                quizId: "296170",
                assignmentId: "1713394",
                passingScore: 18
            }
        ]
    },
    /*test: {
        dbName: "test.db",
        certs: [
            {
                name: "Forklift",
                id: 1,
                color: "#FFFFFF"
            },
            {
                name: "Murder",
                id: 2,
                color: "#FF0000"
            },
            {
                name: "Anarchy",
                id: 3,
                color: "#8000FF"
            }
        ]
    }*/
}
