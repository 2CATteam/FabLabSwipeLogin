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
                name: "Green",
                id: 1,
                color: "#00FF00",
                group: 1
            },
            {
                name: "Yellow",
                id: 2,
                color: "#FFFF00",
                group: 1
            },
            {
                name: "Red",
                id: 3,
                color: "#FF0000",
                group: 1
            },
            {
                name: "Laser",
                id: 4,
                color: "#4444FF"
            },
            {
                name: "3D Printing",
                id: 5,
                color: "#BB00FF"
            }
        ]
    },
    test: {
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
    }
}
