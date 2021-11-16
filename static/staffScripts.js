//Global variables. Great code hygene
var guests = {}
var tasks = []
var certs = []
var shown = null
var socket = null

//Enum, identical to the one in databaseTools.js
const history_types = {
    NOTE: 0,
    ATTENTION: 1,
    PROBLEM: 2,
    REVOKE_CERT: 3,
    ADD_CERT: 4,
    VISIT: 5,
    FIRST_VISIT: 6,
    AUTO_ADD: 7,
}

//Open the Websocket connection to the server
function openSocket() {
    //Choose the relevant url
    socket = new WebSocket(((window.location.protocol === "https:") ? "wss://" : "ws://") + window.location.host + "/staffWS");
    //When we connect, send the token to get authenticated
    socket.onopen = function onConnect() {
        console.log("Connected!")
        socket.send(JSON.stringify({
            secret: getCookie("token")
        }))
    }
    //When we get a message, do this
    socket.onmessage = function onMessage(event) {
        //Get the data and parse it
        let obj = JSON.parse(event.data)
        console.log(obj)
        //Event router
        switch (obj.type) {
            //If given all the guests, rebuild the guest list where appropriate
            case "guestList":
                rebuildGuests(obj.data)
                break
            //If given one guest, swipe them in/out
            case "guest":
                swipeGuest(obj.data)
                break
            //Add history for a single user
            case "history":
                console.log("Got user history")
                //Make string objects into actual date objects
                for (let i in obj.data) {
                    obj.data[i].date = new Date(obj.data[i].date)
                }
                //Find the guest and set their history, then rebuild the notes section for them
                if (guests[obj.user]) {
                    guests[obj.user].history = obj.data
                    markNotes(obj.user)
                }
                //If the modal is currently showing this user, update the modal
                if ($("#managementModal").data("showing") == obj.user) {
                    loadModal(obj.user)
                }
                break
            //Handle tasks data
            case "tasks":
                updateTasks(obj.data)
                break
            //Handle the defining of certifications
            case "certs":
                makeCertLabels(obj.data)
                break
        }
    }
    //When the socket closes, attempt to reconnect it
    socket.onclose = function reconnect(event) {
        console.log(`Socket closed at: ${new Date().toString()}. Attempting to reconnect. Reason for closing is:`)
        console.log(event.reason)
        setTimeout(openSocket, 1000)
    }
}

//Rebuild the guests page when getting a new list
function rebuildGuests(newList) {
    //For each person in the new list
    for (let i in newList) {
        //If they're already in the guest list
        if (guests[newList[i].guest_id]) {
            //Check if anything has changed from the current list
            let shouldRegenerate = false
            for (let j in newList[i]) {
                if (!(newList[i][j] == guests[newList[i].guest_id][j])) {
                    shouldRegenerate = true
                    break
                }
            }
            //If anything has changed
            if (shouldRegenerate) {
                //Make a new row object for this user and insert it after the current one, then remove the current one. Also save the new data, but preserve the history array.
                let newElement = generateRow(newList[i])
                newElement.insertAfter(guests[newList[i].guest_id].dataRow)
                guests[newList[i].guest_id].dataRow.remove()
                let oldHistory = guests[newList[i].guest_id].history
                guests[newList[i].guest_id] = newList[i]
                guests[newList[i].guest_id].history = oldHistory
                guests[newList[i].guest_id].dataRow = newElement
            }
        //If they're not in the guest list already
        } else {
            //Make a row for this guest and add it to the table
            let dataElement = generateRow(newList[i])
            $("#guestsTable").append(dataElement)
            //Save the guest data and add the proper linker
            guests[newList[i].guest_id] = newList[i]
            guests[newList[i].guest_id].dataRow = dataElement
        }
    }

    //Filter out any guests which are no longer here
    for (let i in guests) {
        let stillHere = false
        for (let j in newList) {
            if (newList[j].guest_id == i) {
                stillHere = true
                break
            }
        }
        if (!stillHere) {
            if (guests[i].dataRow) guests[i].dataRow.remove()
            delete guests[i]
        }
    }
}

//Generate a row for a guest
function generateRow(guest) {
    //Start of the row includes the first cell, and begins the div containing all the certification DOM elements
    let toReturn = `<tr style="height: 1px"><td class="align-middle">${guest.name}</td><td style="height: inherit"><div class="d-flex align-items-center h-100">`
    //Make a list of the cert dom elements
    let certDoms = []
    //Make a list of whether the elements should be removed
    let toRemove = []
    //For each cert, generate the HTML
    for (let i in certs) {
        let html = `<div class="certBox me-2" style="opacity: ${guest.certs & (1 << certs[i].id) ? "1" : "0"};">
            <div class="w-100 h-100" style="background-color: ${certs[i].color ? certs[i].color : "#FFFFFF"}" ${guest.certs & (1 << certs[i].id) ? 'data-bs-toggle="tooltip"' : ""} data-bs-placement="top" title="${certs[i].name}"></div>
        </div>`
        //Add the HTML to the array
        certDoms.push(html)
        //Put a corresponding array element to the array we'll be filtering with
        toRemove.push(0)
    }
    //Certs have groups. Subsequent certs will "cover up" previous certs in the same group (think green -> yellow -> red)
    //It does this by setting the respective "toRemove" element to 1 to represent elements which should be removed
    //The end result is that the highest-ranked cert of a group will be the only one shown. If no certs in a group are had, the lowest one remains, as a spacer
    for (let i in certs) {
        //For each subsequent cert
        for (let j = parseInt(i) + 1; j < certs.length; j++) {
            //If either cert is not in a group, then they're obviously not in the same group and you can continue
            if (certs[i].group == undefined || certs[j].group == undefined) {
                continue
            }
            //If they're in different groups, you can safely continue
            if (certs[i].group != certs[j].group) {
                continue
            }
            //At this point, we know they're in the same group!
            //If they have the first cert but not the second cert, the second cert needs to be removed
            if ((guest.certs & (1 << certs[i].id)) && !(guest.certs & (1 << certs[j].id))) {
                toRemove[j] = 1
            //If they have the second cert but not the first, the first should be removed
            } else if (!(guest.certs & (1 << certs[i].id)) && (guest.certs & (1 << certs[j].id))) {
                toRemove[i] = 1
            //If you have both or neither, the one with the lower ID gets removed
            } else if (certs[i].id > certs[j].id) {
                toRemove[j] = 1
            } else if (certs[i].id < certs[j].id) {
                toRemove[i] = 1
            }
        }
    }
    //Do the removal that we just talked about in the above section
    certDoms = certDoms.filter((val, index) => !toRemove[index])

    //Add every cert box to the HTML that we're slowly building
    for (let i in certDoms) {
        toReturn += certDoms[i]
    }

    //Close the previous tags and add a space for notes to go
    toReturn += `</div></td><td style="height: inherit"><div class="d-flex notes align-items-center align-middle h-100"></div></td></tr>`
    //Turn the HTML into a jQuery object
    toReturn = $(toReturn)
    //When it's clicked, show the modal
    toReturn.click(guest, (e) => {
        console.log(e)
        showModal(e.data.guest_id)
    })
    //Enable Bootstrap tooltips
    toReturn.find('[data-bs-toggle="tooltip"]').tooltip()
    return toReturn
}

//Function for when we get a message that a guest has either come or gone
function swipeGuest(guest) {
    //If the new guest is signing IN rather than out
    if (guest.here) {
        //If the client already has data on this guest
        if (guests[guest.guest_id]) {
            //See if anything is different
            let shouldRegenerate = false
            for (let j in guest) {
                if (!(guest[j] == guests[guest.guest_id][j])) {
                    shouldRegenerate = true
                    break
                }
            }
            //If it is, generate a new element and replace the old element, then save the data.
            if (shouldRegenerate) {
                let newElement = generateRow(guest)
                newElement.insertAfter(guests[guest.guest_id].dataRow)
                guests[guest.guest_id].dataRow.remove()
                guests[guest.guest_id] = guest
                guests[guest.guest_id].dataRow = newElement
            }
        //If we don't have data on this guest
        } else {
            //Generate a row and save our data
            let dataElement = generateRow(guest)
            $("#guestsTable").append(dataElement)
            guests[guest.guest_id] = guest
            guests[guest.guest_id].dataRow = dataElement
        }
    } else {
        //If they're swiping out and they're here
        if (guests[guest.guest_id]) {
            //Remove our data of them
            guests[guest.guest_id].dataRow.remove()
            delete guests[guest.guest_id]
        } else {
            //How do you get here
            console.log("Someone left, but they were already gone!")
            console.log(guest)
            //Nothing needs to change
        }
    }
}

//Swipe out a guest
function swipeOutGuest() {
    console.log("Signing out user")
    //Send that to the API and log response
    $.post("/signin", JSON.stringify({ type: "swipe", id: shown.guest_id })).done((data, status, xhr) => {
        console.log(data)
        console.log(status)
        console.log(xhr)
        if (xhr.status != 200) {
            console.error(xhr.status)
        }
    })
    .fail((data, status, xhr) => {
        console.error(data)
        console.error(status)
        console.error(xhr)
    })
}

//Show the modal for the guest
async function loadModal(guest) {

    //Set the shown guest to the selected guest
    shown = guests[guest]

    //If the shown guest isn't actually in the guests list, fetch it from the server
    if (!shown) {
        //Bro what even is this syntax
        //Oh I scrolled up because I figured it out
        //This is my way of turning the jQuery post method into a standard JS Async request
        //I could have used Axios but I already had jQuery soooooo....
        shown = await (() => {
            return new Promise((resolve, reject) => {
                $.post("/guest", JSON.stringify({user: guest}))
                    .done((data, status, xhr) => {
                        if (xhr.status == 200) {
                            //Convert string-dates into Date-dates
                            for (let i in data.history) {
                                data.history[i].date = new Date(data.history[i].date)
                            }
                            resolve(data)
                        } else {
                            reject(status)
                        }
                    })
                    .fail((data, status, xhr) => {
                        console.error(data)
                        console.error(status)
                        console.error(xhr)
                        reject(status)
                    }
                )
            })
        })()
    }
    
    //Associate the guest ID with the DOM object
    $("#managementModal").data("showing", guest)
    
    //Set the names of the modal
    $("#modalName").text(shown.name)
    $("#modalEmail").text(shown.email)

    //Fills the cert table after initializing it
    $("#certTable").find("td").parents("tr").remove()
    for (let i in certs) {
        let lacks = !(shown.certs & (1 << certs[i].id))
        let html = `<tr>
            <td>
                ${certs[i].name}
            </td>
            <td>
                <input readonly onclick="return false;" type="checkbox" ${lacks ? "" : "checked"}>
            </td>
            <td>
                <button class="btn ${lacks ? "btn-primary" : "btn-danger"}" onclick="addRemoveCert('${guest}', ${i})">${lacks ? "Grant" : "Revoke"}</button>
            </td>
        </tr>`
        $("#certTable").append($(html))
    }

    //Remove every data row in the table
    $("#historyTable td").parents("tr").remove()
    //Sort the history table
    shown.history.sort((a, b) => {
        if (a.resolved && !b.resolved) {
            return 1
        } else if (b.resolved && !a.resolved) {
            return -1
        } else if (a.date > b.date) {
            return -1
        } else if (b.date > a.date) {
            return 1
        } else {
            return 0
        }
    })

    //Formats the dates. Apparently making this is really taxing on the system so I initialize it here and reuse it
    let formatter = new Intl.DateTimeFormat('en-us')
    //For each item
    for (let i in shown.history) {
        //Set the type, color, and description of each item
        let type = "Unknown"
        let color = ""
        let description = shown.history[i].note ? shown.history[i].note : ""
        //Set the above values
        switch (shown.history[i].type) {
            case history_types.NOTE:
                type = "Note"
                color = "table-info"
                break
            case history_types.ATTENTION:
                type = "Attention"
                color = "table-warning"
                break
            case history_types.PROBLEM:
                type = "Problem"
                color = "table-danger"
                break
            case history_types.REVOKE_CERT:
                color = "table-danger"
            case history_types.ADD_CERT:
            case history_types.AUTO_ADD:
                type = "Certification"
                break
            case history_types.VISIT:
                type = "Visit"
                break
            case history_types.FIRST_VISIT:
                type = "Registered"
                break
        }
        //Reset the color to grey if they're done
        if (shown.history[i].resolved) {
            color = "table-secondary"
        }
        //Add text if needed for these types
        if (type == "Certification") {
            description = `${findCertById(shown.history[i].cert).name} certification was ${shown.history[i].type == 3 ? "revoked" : "added"} ${shown.history[i].type == 7 ? "automatically" : "manually"}${shown.history[i].note ? " with the following reason:\n\n" + shown.history[i].note : ""}`
        } else if (type == "Visit" && description) {
            description = `Left at ${new Date(description).toLocaleTimeString()}`
        }
        //Make the button if needed
        let buttonHtml = `<button class="btn btn-primary" onclick="resolve(${shown.history[i].event_id}, ${guest})">Resolve</button>`
        if (shown.history[i].resolved) {
            buttonHtml = ""
        }
        //Make the final HTML for the row
        let html = `<tr class="${color}">
            <td data-bs-toggle="tooltip" data-bs-placement="top" title="${shown.history[i].date.toLocaleTimeString()}">
                ${formatter.format(shown.history[i].date)}
            </td>
            <td>
                ${type}
            </td>
            <td>
                <div class="white-spacer">${description}
                </div>
            </td>
            <td>
                ${buttonHtml}
            </td>
        </tr>`
        //Add the row and enable tooltips
        let element = $(html)
        $("#historyTable").append(element)
        element.find('[data-bs-toggle="tooltip"]').tooltip()
    }
}

//Load the modal and then show it
async function showModal(guest) {
    await loadModal(guest)
    $("#managementModal").modal('show')
}

//This gets called when the staff member presses the button to add or remove a cert
function addRemoveCert(guest, index) {
    //Nullish coalescence. Learn it, it will save you SO much time
    let guestCerts = guests[guest]?.certs ?? shown?.certs
    //If no certs, we don't know who this is
    if (guestCerts === null) {
        console.error("I have no idea who or where this guest is:")
        console.error(guest)
        return
    }
    //If they have this cert, we're removing it, so act accordingly
    if (guestCerts & (1 << certs[index].id)) {
        //Ask for confirmation and (optionally) a string explaining why
        let reason = prompt("Please provide a reason for revoking this certification\n\nThis will be visible to the guest, so please be professional")
        //Handle if they canceled
        if (reason == null) return 
        //Send the thing to the server
        socket.send(JSON.stringify({
            type: "revokeCert",
            id: guest,
            cert: certs[index].id,
            reason: reason
        }))
    //Otherwise we're granting it
    } else {
        socket.send(JSON.stringify({
            type: "addCert",
            id: guest,
            cert: certs[index].id
        }))
    }
}

//Mark an event as resolved
function resolve(event_id, user) {
    socket.send(JSON.stringify({
        type: "resolve",
        id: event_id,
        user: user
    }))
}

//Maps certs to IDs
function findCertById(id) {
    for (let i in certs) {
        if (certs[i].id == id) {
            return certs[i]
        }
    }
    return null
}

//Add a note to a user
function submitNote() {
    socket.send(JSON.stringify({
        type: "note",
        level: $("#noteSelect").val(),
        id: $("#managementModal").data("showing"),
        note: $("#noteText").val()
    }))
    console.log($("#noteSelect").val())
    $("#noteText").val("")
}

//Adds the notes objects
function markNotes(user) {
    //Get the parent for all the notes elements
    let parent = guests[user].dataRow.find(".notes")
    //Remove the children
    parent.empty()
    //Make an object collecting all the notes info into categories
    let notes = {}
    //For all the history items
    for (let i in guests[user].history) {
        //If it's resolved, skip this one
        if (guests[user].history[i].resolved) continue
        //Type router
        switch (guests[user].history[i].type) {
            //For notes, add it to the notes array
            case history_types.FIRST_VISIT:
                if (!notes.notes) notes.notes = []
                notes.notes.push(guests[user].history[i].note)
                break
            case history_types.NOTE:
                if (!notes.notes) notes.notes = []
                notes.notes.push(guests[user].history[i].note)
                break
            //For things which need attention, add them to the attention array
            case history_types.ATTENTION:
                if (!notes.attention) notes.attention = []
                notes.attention.push(guests[user].history[i].note)
                break
            //For problems, add it to that array
            case history_types.PROBLEM:
                if (!notes.problem) notes.problem = []
                notes.problem.push(guests[user].history[i].note)
                break
            //You get the idea
            case history_types.REVOKE_CERT:
                if (!notes.revoked) notes.revoked = []
                notes.revoked.push(`${findCertById(guests[user].history[i].cert).name} certification was ${guests[user].history[i].type == 3 ? "revoked" : "added"} ${guests[user].history[i].type == 7 ? "automatically" : "manually"}${guests[user].history[i].note ? " with the following reason:\n\n" + guests[user].history[i].note : ""}`)
                break
        }
    }
    //Add all of the notes into a string for each section, and make HTML for that, then add that to the parent
    //This code is so WET
    if (notes.notes) {
        let string = ""
        for (let i in notes.notes) {
            string += notes.notes[i] + "\n\n"
        }
        string = string.trim()
        let html = `<p data-bs-toggle="popover" data-bs-trigger="hover focus" title="Notes" data-bs-content="${string}" data-bs-placement="left" tab-index="0" class="text-center my-0 fs-5">📝</p>`
        let element = $(html).popover()
        parent.append(element)
    }
    if (notes.attention) {
        let string = ""
        for (let i in notes.attention) {
            string += notes.attention[i] + "\n\n"
        }
        string = string.trim()
        let html = `<p data-bs-toggle="popover" data-bs-trigger="hover focus" title="Attention" data-bs-content="${string}" data-bs-placement="left" tab-index="0" class="text-center my-0 fs-5">⚠</p>`
        let element = $(html).popover()
        parent.append(element)
    }
    if (notes.problem) {
        let string = ""
        for (let i in notes.problem) {
            string += notes.problem[i] + "\n\n"
        }
        string = string.trim()
        let html = `<p data-bs-toggle="popover" data-bs-trigger="hover focus" title="Problems" data-bs-content="${string}" data-bs-placement="left" tab-index="0" class="text-center my-0 fs-5">🤬</p>`
        let element = $(html).popover()
        parent.append(element)
    }
    if (notes.revoked) {
        let string = ""
        for (let i in notes.revoked) {
            string += notes.revoked[i] + "\n\n"
        }
        string = string.trim()
        let html = `<p data-bs-toggle="popover" data-bs-trigger="hover focus" title="Revoked Certifications" data-bs-content="${string}" data-bs-placement="left" tab-index="0" class="text-center my-0 fs-5">😿</p>`
        let element = $(html).popover()
        parent.append(element)
    }
}

//Update the tasks section
function updateTasks(newList) {
    //Convert all the dates
    for (let i in newList) {
        newList[i].date = new Date(newList[i].date)
    }
    let now = new Date()
    newList.sort((a, b) => {
        //Number of days until each is due
        let aLeft = Math.floor((now - a.date) / 86400000) - a.period
        let bLeft = Math.floor((now - b.date) / 86400000) - b.period
        if (aLeft == bLeft) {
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        } else {
            return bLeft - aLeft
        }
    })
    let index = 0
    let start = 0
    for (let i in newList) {
        while (tasksInclude(newList[i].task_id) && tasks[index].task_id != newList[i].task_id) {
            if ((Math.floor((now - tasks[index].date) / 86400000) - tasks[index].period) >= 0) start++
            //https://stackoverflow.com/questions/467336/how-to-use-slidedown-or-show-function-on-a-table-row
            tasks[index].element
                .find('td')
                .css("padding", "0")
                .wrapInner('<div style="display: block; padding: .5rem .5rem" />')
                .parent()
                .find('td > div')
                .slideUp(400, function() { this.remove() }.bind(tasks[index].element))
            tasks.splice(index, 1)
        }
        if (tasksInclude(newList[i].task_id)) {
            if (tasks[index].date - newList[i].date != 0) {
                if ((Math.floor((now - tasks[index].date) / 86400000) - tasks[index].period) >= 0) start++
                //https://stackoverflow.com/questions/467336/how-to-use-slidedown-or-show-function-on-a-table-row
                tasks[index].element
                    .find('td')
                    .css("padding", "0")
                    .wrapInner('<div style="display: block;" />')
                    .parent()
                    .find('td > div')
                    .slideUp(400, function() { this.remove() }.bind(tasks[index].element))
                tasks.splice(index, 1)
            } else {
                index++
            }
        }
    }
    for (let i in newList) {
        if (tasksInclude(newList[i].task_id)) {
            newList[i].element = tasks[i].element
            newList[i].element.find(".daysLeft").text(Math.max((Math.floor((now - newList[i].date) / 86400000) - newList[i].period) * -1, 0))
            tasks[i] = newList[i]
        } else {
            newList[i].element = $(`<tr>
                <td>
                    ${newList[i].name}
                </td>
                <td>
                    ${newList[i].description}
                </td>
                <td>
                    ${newList[i].period} day${newList[i].period > 1 ? "s" : ""}
                </td>
                <td class="daysLeft">
                    ${Math.max((Math.floor((now - newList[i].date) / 86400000) - newList[i].period) * -1, 0)}
                </td>
                <td>
                    <button class="btn btn-primary" onclick="doTask(${newList[i].task_id})">Done</button>
                </td>
            </tr>`)
            tasks.splice(i, 0, newList[i])
            if (i > 0) {
                newList[i - 1].element.after(newList[i].element)
            } else {
                if ($("#dueNowMarker").length) start++
                if ((Math.floor((now - newList[0].date) / 86400000) - newList[0].period) < 0 && $("#dueLaterMarker").length) start++
                $("#tasksTable tr").eq(start).after(newList[i].element)
            }
            //https://stackoverflow.com/questions/467336/how-to-use-slidedown-or-show-function-on-a-table-row
            newList[i].element
                .find('td')
                .wrapInner('<div style="display: none;" />')
                .parent()
                .find('td > div')
                .slideDown()
        }
    }
    if (tasks.length > 0 && ((Math.floor((now - tasks[0].date) / 86400000) - tasks[0].period) >= 0)) {
        if (!$("#dueNowMarker").length) {
            let element = $(`<tr id="dueNowMarker">
                <td colspan="5" class="fs-5">
                    Due now:
                </td>
            </tr>`)
            $("#tasksTable tr").eq(0).after(element)
            element.slideDown()
        }
    } else {
        $("#dueNowMarker")
            .find('td')
            .css("padding", "0")
            .wrapInner('<div style="display: block; padding: .5rem .5rem" />')
            .parent()
            .find('td > div')
            .slideUp(400, function() { this.remove() }.bind($("#dueNowMarker")))
    }
    $("#dueLaterMarker").remove()
    for (let i in tasks) {
        if ((Math.floor((now - tasks[i].date) / 86400000) - tasks[i].period) < 0) {
            tasks[i].element.before($(`<tr id="dueLaterMarker">
                <td colspan="5" class="fs-5">
                    Due later:
                </td>
            </tr>`))
            return
        }
    }
}

//Checks if tasks include a specific task
function tasksInclude(id) {
    for (let i in tasks) {
        if (tasks[i].task_id == id) {
            return true
        }
    }
    return false
}

//Create a task to the websocket
function createTask() {
    let start = new Date()
    start.setHours(0)
    start.setMinutes(0)
    start.setSeconds(0)
    start.setMilliseconds(0)
    socket.send(JSON.stringify({
        type: "addTask",
        name: $("#taskName").val(),
        description: $("#taskDescription").val(),
        period: parseInt($("#taskPeriod").val()),
        date: start.toISOString()
    }))
    $("#taskName").val("")
    $("#taskDescription").val("")
    parseInt($("#taskPeriod").val("1"))
}

//Mark a task as recently done
function doTask(id) {
    let done = new Date()
    done.setHours(0)
    done.setMinutes(0)
    done.setSeconds(0)
    done.setMilliseconds(0)
    socket.send(JSON.stringify({
        type: "doTask",
        id: id,
        date: done.toISOString()
    }))
}

//Tell all the tasks that they're one day closer to being due
function ageTasks() {
    let done = new Date()
    done.setHours(0)
    done.setMinutes(0)
    done.setSeconds(0)
    done.setMilliseconds(0)
    //Wait wtf what does this do?
    done.setDate(20)
    for (let i in tasks) {
        socket.send(JSON.stringify({
            type: "doTask",
            id: tasks[i].task_id,
            date: done.toISOString()
        })) 
    }
}

//Maybe this will do something, but not anymore
function makeCertLabels(newList) {
    certs = newList
    //50,000 Lines of Code used to live here. Now, it's a ghost town
}

//On start, open the socket and enable all the tooltips
$(document).ready(() => {
    openSocket()
    //https://getbootstrap.com/docs/5.0/components/tooltips/
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl)
    })
})

//Get document cookie from key
function getCookie(key) {
	obj = {}
	list = document.cookie.split(";")
	for (x in list) {
		if (list[x]) {
			pair = list[x].split("=", 2)
			obj[pair[0].trim()] = pair[1].trim()
		}
	}
	return obj[key]
}

//Set document cookie.
function setCookie(key, value) {
	document.cookie = `${key}=${value}`
}
