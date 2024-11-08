//Saves info on each instance, including the name, db, and all of the certifications
module.exports = {
    fabLab: {
        dbName: "fabLab.db", //This is just the name of the database for this shop. It can be any valid filename, just DO NOT CHANGE THIS ONCE SET or you will lose all your data
        certs: [
            /*
            We no longer need this, because agreeing to the waiver is REQUIRED for EVERY account
            {
                name: "Waiver",
                id: 6,
                color: "#FFFFFF",
                expirationExempt: true
            },*/
            {
                name: "Culture Quiz",
                description: "Everyone has to take this quiz; this helps you understand what our expectations are of you while you're joining us in the fabrication lab.",
                id: 7,
                color: "#00FFFF",
                quizId: "278126",
                assignmentId: "1614160"
            },
            {
                name: "Green", //Name of the certification
                description: "Green certifications covers many of our handtools and some simpler machines. This is your ticket into the loudroom, and to the big stuff.", //Shown on the directory
                id: 1, //The ID used for keeping track of certs. This must be a positive integer between 0 and 64.
                color: "#00FF00", //The color of the certification
                group: 1, //If put in a group, certs will be progressive within that group - so, red replaces yellow, which replaces green.
                quizId: "296056", //The ID of the quiz on Canvas
                assignmentId: "1712603", //The ID of the assignment (NOT THE SAME AS QUIZ ID) on Canvas
                expirationExempt: false, //If true, this certification will never expire
            },
            {
                name: "Yellow",
                description: "Yellow includes the more dangerous wood shop tools, like saws and whatnot. You cannot be Yellow certified without completing Green certification first.",
                id: 2,
                color: "#FFFF00",
                group: 1,
                quizId: "296058",
                assignmentId: "1712611"
            },
            {
                name: "Red",
                description: "Red certification covers the most dangerous woodshop tools, like the Lathe and the Planer and Jointer. This requires Yellow first, as well as an in-person walkthrough after the quiz.",
                id: 3,
                color: "#FF0000",
                group: 1,
                quizId: "296157",
                assignmentId: "1713334"
            },
            {
                name: "Laser",
                description: "This grants access to the laser cutters, one of our fastest and most useful tools.",
                id: 4,
                color: "#4444FF",
                quizId: "296167",
                assignmentId: "1713379"
            },
            {
                name: "3D Printing",
                description: "This grants access to the 3D printers, and shows you how to set up your files for them.",
                id: 5,
                color: "#BB00FF",
                quizId: "296170",
                assignmentId: "1713394"
            }
        ],
        "strings": {
            waiver: "I generally agree to just, like, be a super cool dude, dudette, or whatever form of chill I identify as. Not only will I not sue you guys, I'll also be happy to do whatever I can to help out.",
            registrationConfirmation: "Welcome! Check your email!",
            welcomeString: "Welcome to\nthe Fab Lab",
            canvasWelcomeTitle: "Welcome to our Canvas course!",
            canvasWelcomeBody: `Welcome to the Tom Love Innovation Hub Fabrication Lab!

            You’ve now been enrolled in a canvas course titled ‘Shop Fundamentals’ that you can access by signing into canvas just like you do for your other courses. This canvas course holds the training videos and quizzes for access to using Fab Lab equipment.
            
            Keep in mind, before you’ll be allowed to use any of our tools, in addition to the respective trainings, you’ll have to complete our Fab Lab Culture Quiz, which is just a mechanism for making sure you’re aware of how to engage with the shop. It’ll take you all of three minutes – maybe.
            
            This new method of training and keeping up with access is a huge undertaking on our end, so we’re thankful for your patience and feedback! It is new and complex, and again, your insight is helpful; If you run into new issues or challenges, please let us know.
            
            If you have any questions or comments, please email us at:
            
            fablab@ou.edu`,
            emailWelcomeTitle: "Welcome to the Fab Lab!",
            emailWelcomeBody: `Hey you! Welcome to the Fab Lab!

            If you're getting this email, chances are you just showed up at the Fab Lab for the first time, or you're getting ready to go there soon. This email is just intended to give you a brief overview of what you need to do before you start using our machines.
            
            First off, every new visitor is required to take our Culture Quiz, which just establishes some expectations for how you conduct yourself in the lab. The link to that is here:
            
            https://www.oushoptraining.com/fabLab/CultureQuiz
            
            Second, you'll need to take the certification for whatever tool(s) you intend to use. You can see the full list of those here:
            
            https://www.oushoptraining.com/fabLab
            
            Once you've taken care of those two things, you're good to go! Let us know if you have any questions or problems, either by talking to a staff member in the shop, or emailing us at fablab@ou.edu`,
            expirationWarningTitle: "Fab Lab tool certifications nearing expiration",
            expirationWarningBody: "Hey there! Some of your Fab Lab tool certifications are close to expiring. In 14 days, you'll lose the following certifications:\n%certs%\n\nWe remove these certifications regularly, to make sure our shop is as safe as possible.\n\nIf you want to keep these certifications, you can either retake the certification quizzes, or come to the shop and put your trainings to use.\n\nOnce they expire, don't worry! You'll just need to retake the certification quizzes before you use their respective tools.",
            expirationHappenedTitle: "Fab Lab tool certifications have expired",
            expirationHappenedBody: "Hey there! In an effort to make sure our shop is as safe as possible, our tool certifications regularly expire, after 45 days of not being used.\n\nAs a result, these tool certifications have expired:\n%certs%\n\nBefore you come into the shop to use these certifications' respective tools, you'll just need to retake the relevant certification quizzes.",
        }
    }
}
