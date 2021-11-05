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
                id: 7,
                color: "#00FFFF",
                quizId: "1614160",
                passingScore: 11
            },
            {
                name: "Green",
                id: 1, //The ID used for keeping track of certs. This must be a positive integer between 0 and 64.
                color: "#00FF00", //The color of the certification
                group: 1, //If put in a group, certs will be progressive
                quizId: "1712603", //The ID of the quiz on Canvas
                passingScore: 15 //The passing score of the quiz on Canvas
            },
            {
                name: "Yellow",
                id: 2,
                color: "#FFFF00",
                group: 1,
                quizId: "1712611",
                passingScore: 47
            },
            {
                name: "Red",
                id: 3,
                color: "#FF0000",
                group: 1,
                quizId: "1713334",
                passingScore: 22
            },
            {
                name: "Laser",
                id: 4,
                color: "#4444FF",
                quizId: "1713379",
                passingScore: 10
            },
            {
                name: "3D Printing",
                id: 5,
                color: "#BB00FF",
                quizId: "1713394",
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
