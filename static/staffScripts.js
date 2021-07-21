var guests = {}
var tasks = []
var certs = []
var socket = null

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

function openSocket() {
    socket = new WebSocket(((window.location.protocol === "https:") ? "wss://" : "ws://") + window.location.host + "/staffWS");
    socket.onopen = function onConnect() {
        console.log("Connected!")
    }
    socket.onmessage = function onMessage(event) {
        let obj = JSON.parse(event.data)
        console.log(obj)
        switch (obj.type) {
            case "guestList":
                rebuildGuests(obj.data)
                break
            case "guest":
                swipeGuest(obj.data)
                break
            case "history":
                for (let i in obj.data) {
                    obj.data[i].date = new Date(obj.data[i].date)
                }
                guests[obj.user].history = obj.data
                if ($("#managementModal").data("showing") == obj.user) {
                    loadModal(obj.user)
                }
                markNotes(obj.user)
                break
            case "tasks":
                updateTasks(obj.data)
                break
            case "certs":
                makeCertLabels(obj.data)
                break
        }
    }
    socket.onclose = function reconnect(event) {
        console.log(`Socket closed at: ${new Date().toString()}. Attempting to reconnect. Reason for closing is:`)
        console.log(event.reason)
        setTimeout(openSocket, 1000)
    }
}

function rebuildGuests(newList) {
    for (let i in newList) {
        if (guests[newList[i].guest_id]) {
            let shouldRegenerate = false
            for (let j in newList[i]) {
                if (!(newList[i][j] == guests[newList[i].guest_id][j])) {
                    shouldRegenerate = true
                    break
                }
            }
            if (shouldRegenerate) {
                let newElement = generateRow(newList[i])
                newElement.insertAfter(guests[newList[i].guest_id].dataRow)
                guests[newList[i].guest_id].dataRow.remove()
                guests[guest.guest_id] = guest
                guests[newList[i].guest_id].dataRow = newElement
            }
        } else {
            let dataElement = generateRow(newList[i])
            $("#guestsTable").append(dataElement)
            guests[newList[i].guest_id] = newList[i]
            guests[newList[i].guest_id].dataRow = dataElement
        }
    }

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

function generateRow(guest) {
    let toReturn = `<tr style="height: 1px"><td class="align-middle">${guest.name}</td>`
    for (let i in certs) {
        toReturn += `<td style="height: inherit">
            <div class="d-flex align-items-center justify-content-center w-100 h-100">
                <div class="d-flex h-100 w-100 align-items-center justify-content-center" style="max-width: 30px">
                    <input readonly onclick="return false;" type="checkbox" ${guest.certs & (1 << certs[i].id) ? "checked" : ""}>
                <div>
            </div>
        </td>`
    }
    toReturn += `<td class="notes"></td></tr>`
    toReturn = $(toReturn)
    toReturn.click(guest, (e) => {
        console.log(e)
        showModal(e.data.guest_id)
    })
    return $(toReturn)
}

function swipeGuest(guest) {
    if (guest.here) {
        if (guests[guest.guest_id]) {
            let shouldRegenerate = false
            for (let j in guest) {
                if (!(guest[j] == guests[guest.guest_id][j])) {
                    shouldRegenerate = true
                    break
                }
            }
            if (shouldRegenerate) {
                let newElement = generateRow(guest)
                newElement.insertAfter(guests[guest.guest_id].dataRow)
                guests[guest.guest_id].dataRow.remove()
                guests[guest.guest_id] = guest
                guests[guest.guest_id].dataRow = newElement
            }
        } else {
            let dataElement = generateRow(guest)
            $("#guestsTable").append(dataElement)
            guests[guest.guest_id] = guest
            guests[guest.guest_id].dataRow = dataElement
        }
    } else {
        if (guests[guest.guest_id]) {
            guests[guest.guest_id].dataRow.remove()
            delete guests[guest.guest_id]
        } else {
            console.log("Someone left, but they were already here!")
            console.log(guest)
        }
    }
}

function loadModal(guest) {
    $("#managementModal").data("showing", guest)
    
    //Set the names of the modal
    $("#modalName").text(guests[guest].name)
    $("#modalEmail").text(guests[guest].email)

    //Fills the cert table
    $("#certTable").find("td").parents("tr").remove()
    for (let i in certs) {
        let lacks = !(guests[guest].certs & (1 << certs[i].id))
        let html = `<tr>
            <td>
                ${certs[i].name}
            </td>
            <td>
                <input readonly onclick="return false;" type="checkbox" ${lacks ? "" : "checked"}>
            </td>
            <td>
                <button class="btn ${lacks ? "btn-primary" : "btn-danger"}" onclick="addRemoveCert(${guest}, ${i})">${lacks ? "Grant" : "Revoke"}</button>
            </td>
        </tr>`
        $("#certTable").append($(html))
    }

    //Fill the History table
    $("#historyTable td").parents("tr").remove()
    guests[guest].history.sort((a, b) => {
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
    let formatter = new Intl.DateTimeFormat('en-us')
    for (let i in guests[guest].history) {
        let type = "Unknown"
        let color = ""
        let description = guests[guest].history[i].note ? guests[guest].history[i].note : ""
        switch (guests[guest].history[i].type) {
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
        if (guests[guest].history[i].resolved) {
            color = "table-secondary"
        }
        if (type == "Certification") {
            description = `${findCertById(guests[guest].history[i].cert).name} certification was ${guests[guest].history[i].type == 3 ? "revoked" : "added"} ${guests[guest].history[i].type == 7 ? "automatically" : "manually"}${guests[guest].history[i].note ? " with the following reason:\n\n" + guests[guest].history[i].note : ""}`
        }
        let buttonHtml = `<button class="btn btn-primary" onclick="resolve(${guests[guest].history[i].event_id}, ${guest})">Resolve</button>`
        if (guests[guest].history[i].resolved) {
            buttonHtml = ""
        }
        let html = `<tr class="${color}">
            <td>
                ${formatter.format(guests[guest].history[i].date)}
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
        $("#historyTable").append($(html))
    }
}

function showModal(guest) {
    loadModal(guest)
    $("#managementModal").modal('show')
}

function addRemoveCert(guest, index) {
    if (guests[guest].certs & (1 << certs[index].id)) {
        let reason = prompt("Please provide a reason for revoking this certification\n\nThis will be visible to the guest, so please be professional")
        if (reason == null) return 
        socket.send(JSON.stringify({
            type: "revokeCert",
            id: guest,
            cert: certs[index].id,
            reason: reason
        }))
    } else {
        socket.send(JSON.stringify({
            type: "addCert",
            id: guest,
            cert: certs[index].id
        }))
    }
}

function resolve(event_id, user) {
    socket.send(JSON.stringify({
        type: "resolve",
        id: event_id,
        user: user
    }))
}

function findCertById(id) {
    for (let i in certs) {
        if (certs[i].id == id) {
            return certs[i]
        }
    }
    return null
}

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

function markNotes(user) {
    let parent = guests[user].dataRow.find(".notes")
    parent.empty()
    let notes = {}
    for (let i in guests[user].history) {
        if (guests[user].history[i].resolved) continue
        switch (guests[user].history[i].type) {
            case history_types.NOTE:
                if (!notes.notes) notes.notes = []
                notes.notes.push(guests[user].history[i].note)
                break
            case history_types.ATTENTION:
                if (!notes.attention) notes.attention = []
                notes.attention.push(guests[user].history[i].note)
                break
            case history_types.PROBLEM:
                if (!notes.problem) notes.problem = []
                notes.problem.push(guests[user].history[i].note)
                break
            case history_types.REVOKE_CERT:
                if (!notes.revoked) notes.revoked = []
                notes.revoked.push(`${findCertById(guests[user].history[i].cert).name} certification was ${guests[user].history[i].type == 3 ? "revoked" : "added"} ${guests[user].history[i].type == 7 ? "automatically" : "manually"}${guests[user].history[i].note ? " with the following reason:\n\n" + guests[user].history[i].note : ""}`)
                break
        }
    }
    if (notes.notes) {
        let string = ""
        for (let i in notes.notes) {
            string += notes.notes[i] + "\n\n"
        }
        string = string.trim()
        let html = `<p data-bs-toggle="popover" data-bs-trigger="hover focus" title="Notes" data-bs-content="${string}" data-bs-placement="left" tab-index="0" class="text-center">📝</p>`
        let element = $(html).popover()
        parent.append(element)
    }
    if (notes.attention) {
        let string = ""
        for (let i in notes.attention) {
            string += notes.attention[i] + "\n\n"
        }
        string = string.trim()
        let html = `<p data-bs-toggle="popover" data-bs-trigger="hover focus" title="Attention" data-bs-content="${string}" data-bs-placement="left" tab-index="0" class="text-center">⚠</p>`
        let element = $(html).popover()
        parent.append(element)
    }
    if (notes.problem) {
        let string = ""
        for (let i in notes.problem) {
            string += notes.problem[i] + "\n\n"
        }
        string = string.trim()
        let html = `<p data-bs-toggle="popover" data-bs-trigger="hover focus" title="Problems" data-bs-content="${string}" data-bs-placement="left" tab-index="0" class="text-center">🤬</p>`
        let element = $(html).popover()
        parent.append(element)
    }
    if (notes.revoked) {
        let string = ""
        for (let i in notes.revoked) {
            string += notes.revoked[i] + "\n\n"
        }
        string = string.trim()
        let html = `<p data-bs-toggle="popover" data-bs-trigger="hover focus" title="Revoked Certifications" data-bs-content="${string}" data-bs-placement="left" tab-index="0" class="text-center">😿</p>`
        let element = $(html).popover()
        parent.append(element)
    }
}

function updateTasks(newList) {
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
    for (let i in newList) {
        while (tasksInclude(newList[i].task_id) && tasks[index].task_id != newList[i].task_id) {
            //https://stackoverflow.com/questions/467336/how-to-use-slidedown-or-show-function-on-a-table-row
            tasks[index].element
                .find('td')
                .wrapInner('<div style="display: block; padding: .5rem .5rem" />')
                .parent()
                .css("padding", "0 0")
                .find('td > div')
                .slideUp(400, function() { this.remove() }.bind(tasks[index].element))
            tasks.splice(index, 1)
        }
        if (tasksInclude(newList[i].task_id)) {
            if (tasks[index].date - newList[i].date != 0) {
                //https://stackoverflow.com/questions/467336/how-to-use-slidedown-or-show-function-on-a-table-row
                tasks[index].element
                    .find('td')
                    .wrapInner('<div style="display: block;" />')
                    .parent()
                    .css("padding", "0 0")
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
                $("#tasksTable tr").eq(0).after(newList[i].element)
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
}

function tasksInclude(id) {
    for (let i in tasks) {
        if (tasks[i].task_id == id) {
            return true
        }
    }
    return false
}

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

function ageTasks() {
    let done = new Date()
    done.setHours(0)
    done.setMinutes(0)
    done.setSeconds(0)
    done.setMilliseconds(0)
    done.setDate(20)
    for (let i in tasks) {
        socket.send(JSON.stringify({
            type: "doTask",
            id: tasks[i].task_id,
            date: done.toISOString()
        })) 
    }
}

function makeCertLabels(newList) {
    let last = $("#nameLabel")
    for (let i in certs) {
        certs[i].dom.remove()
    }
    certs = []
    for (let i in newList) {
        let html = `<th class="text-center">
            ${newList[i].name}
        </th>`
        let element = $(html)
        element.insertAfter(last)
        last = element
        newList[i].dom = element
        certs.push(newList[i])
    }
}

$(document).ready(() => {
    openSocket()
    //https://getbootstrap.com/docs/5.0/components/tooltips/
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl)
    })
})