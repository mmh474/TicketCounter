var allUsers = [];
var users = [];
var usersView = [];
var tickets = [];
var currentUser = null;
var userRestriction = null;
var userOrganization = null;
var userGroups = [];
var groups = {};
var onHoldEnabled = false;
var allAgentsEnabled = false;
var organizationEnabled = false;
var groupsEnabled = false;
var onlyMineEnabled = false;
var totalNewTickets = 0;
var totalOpenTickets = 0;
var totalPendingTickets = 0;
var totalOnHoldTickets = 0;
var totalUnsolvedTickets = 0;
var errorState = false;
var lastSortColumn = 'name';
var lastSortOrder = 'asc';
var selectedDisplay = null;
var includeSuspended = false;
var organizationRead = false;
var allAgentsRead = false;
var pageSize = 15;
var pages = null;
var page = 1;
var agentsRead = 0;

var client = ZAFClient.init();

$(document).ready(function() {

    var xhr = new XMLHttpRequest();
    xhr.open("GET", 'https://cdn.jsdelivr.net/npm/@zendeskgarden/svg-icons@6.3.0/dist/index.svg');
    xhr.onload = function() {
        document.getElementById('svg-container').innerHTML = xhr.responseText;
    }
    xhr.send();

    loadData();
    /*client.on('pane.activated', function() {
      cleanupCounts();
      $("#spinnerDiv").show();
      partialRefresh();
    });*/
});

/**
    Shows main page with ticket counts.
*/
function showMain(data) {

    data = {
      Agents: usersView,
      OnHoldEnabled: onHoldEnabled,
      AllAgentsEnabled: allAgentsEnabled,
      AllAgentsSelected: (selectedDisplay === 'allAgents'),
      OrganizationEnabled: organizationEnabled,
      OrganizationSelected: (selectedDisplay === 'organization'),
      GroupsEnabled: groupsEnabled,
      GroupsSelected: (selectedDisplay === 'groups'),
      OnlyMineEnabled: onlyMineEnabled,
      OnlyMineSelected: (selectedDisplay === 'onlyMine'),
      Groups: userGroups,
      SortingColumn: lastSortColumn,
      SortingOrder: lastSortOrder,
      NewTickets: totalNewTickets,
      OpenTickets: totalOpenTickets,
      PendingTickets: totalPendingTickets,
      OnHoldTickets: totalOnHoldTickets,
      UnsolvedTickets: totalUnsolvedTickets,
      NameColumnSortingAsc: (lastSortColumn === 'name' && lastSortOrder === 'asc'),
      NameColumnSortingDesc: (lastSortColumn === 'name' && lastSortOrder === 'desc'),
      OpenColumnSortingAsc: (lastSortColumn === 'open' && lastSortOrder === 'asc'),
      OpenColumnSortingDesc: (lastSortColumn === 'open' && lastSortOrder === 'desc'),
      PendingColumnSortingAsc: (lastSortColumn === 'pending' && lastSortOrder === 'asc'),
      PendingColumnSortingDesc: (lastSortColumn === 'pending' && lastSortOrder === 'desc'),
      OnHoldColumnSortingAsc: (lastSortColumn === 'onhold' && lastSortOrder === 'asc'),
      OnHoldColumnSortingDesc: (lastSortColumn === 'onhold' && lastSortOrder === 'desc'),
      TotalColumnSortingAsc: (lastSortColumn === 'total' && lastSortOrder === 'asc'),
      TotalColumnSortingDesc: (lastSortColumn === 'total' && lastSortOrder === 'desc'),
      Pages: pages,
      CurrentPage: page
    };
    $("#spinnerDiv").hide();
    var source = $("#requester-template").html();
    var template = Handlebars.compile(source);
    var html = template(data);
    $("#content").html(html);
    $('#content').removeClass('opacity');
}

/**
    Shows page with error message
*/
function showError(errorMsg) {
    var error = {
        error_message : errorMsg
    };

    $("#spinnerDiv").hide();
    var source = $("#error-template").html();
    var template = Handlebars.compile(source);
    var html = template(error);
    $("#content").html(html);
    $('#content').removeClass('opacity');
}

function loadData() {
    $("#spinnerDiv").show();

    let getSettingsPromise = client.metadata().then(metadata => {
        return metadata.settings.include_suspended_agents;
    });
    let getCurrentUserPromise = client.get('currentUser').then(function(data) {
        _.each(data.currentUser.groups, function(group) {
            group.selected = false;
            userGroups.push(group);
        });
        return data.currentUser.id;
    });
    let getNewCountPromise = searchTicketsCount(getNewTicketsQuery());
    let getOpenCountPromise = searchTicketsCount(getTicketsByStatus('open'));
    let getPendingCountPromise = searchTicketsCount(getTicketsByStatus('pending'));
    let getOnHoldCountPromise = searchTicketsCount(getTicketsByStatus('hold'));
    let getAccountSettingsPromise = getAccountSettings();

    // invoke all promises and wait for them to finish
    Promise.all([getSettingsPromise, getCurrentUserPromise, getAccountSettingsPromise, getNewCountPromise, getOpenCountPromise, getPendingCountPromise, getOnHoldCountPromise]).then(values => {
        includeSuspended = values[0];
        onHoldEnabled = values[2].settings.active_features.on_hold_status;
        totalNewTickets = values[3].count;
        totalOpenTickets = values[4].count;
        totalPendingTickets = values[5].count;
        totalOnHoldTickets = values[6].count;
        totalUnsolvedTickets = totalNewTickets + totalOpenTickets + totalPendingTickets + totalOnHoldTickets;
        return getAgent(values[1]);
    }).then(u  => {
        if(users.length > 0) {
            // users already loaded. skip that part
            getCounts();
            sortBy(lastSortColumn, lastSortOrder);
        } else {
            // based on user access level, determine what users need to be read
            if(groupsEnabled && currentUser.default_group_id != null) {
                // read agents in current user's default group
                getAgentsByGroup(currentUser.default_group_id, 1);
            } else if(organizationEnabled) {
                // read agents in current user's organization
                getAgentsByOrganization(currentUser.organization_id, 1);
            } else if(allAgentsEnabled) {
                // read all agents
                getAllAgents(1);
            } else {
                users.push(currentUser);
                allUsers.push(currentUser);
                usersView = users;
                pages = 1;
            }
        }
    })
    .catch((error) => {
        errorState = true;
        let msg = '';
        if(error.status == 403) {
            msg = 'Your user account does not have sufficient access to view this content. '
                    + 'Please contact your Zendesk Administrator for further details.';
        } else if(error.responseText !== undefined) {
            msg = error.responseText;
        } else if(error.statusText !== undefined) {
            msg = error.statusText;
        } else {
            msg = error;
        }
        showError('Error loading app: ' + msg);
    });
}

function getCounts() {
    let promiseArray = [];
    for(i = 0; i < usersView.length; i++) {
        let u = _.findWhere(allUsers, {id: usersView[i].id});
        if(u !== undefined && u.openCount !== undefined) {
            usersView[i].openCount = u.openCount;
            usersView[i].pendingCount = u.pendingCount;
            usersView[i].onHoldCount = u.onHoldCount;
            usersView[i].totalCount = u.totalCount;
        } else {
            getCountsPerUser(usersView[i].id, usersView[i], promiseArray);
        }
    }
    if(promiseArray.length > 0) {
        $("#spinnerDiv").show();
        disableButtons();
        Promise.all(promiseArray).then(values => {
            for(i = 0; i < values.length; i++) {
                let userX = values[i];
                if(userX === null) {
                    continue;
                }
                let u = _.findWhere(usersView, {id: userX.id});
                let u2 = _.findWhere(allUsers, {id: userX.id});
                if(userX.openCount !== undefined) {
                    u.openCount = userX.openCount;
                    u2.openCount = userX.openCount;
                    agentsRead++;
                } else if(userX.pendingCount !== undefined) {
                    u.pendingCount = userX.pendingCount;
                    u2.pendingCount = userX.pendingCount;
                } else if(userX.onHoldCount !== undefined) {
                    u.onHoldCount = userX.onHoldCount;
                    u2.onHoldCount = userX.onHoldCount;
                }
                if(u.openCount !== undefined && u.pendingCount !== undefined && u.onHoldCount !== undefined) {
                    u.totalCount = u.openCount + u.pendingCount + u.onHoldCount;
                    u2.totalCount = u.openCount + u.pendingCount + u.onHoldCount;
                }
            }
            showMain();
        });
    } else {
        showMain();
    }
}

function getAllCounts(callback) {
    let promiseArray = [];
    for(i = 0; i < users.length; i++) {
        let u = _.findWhere(allUsers, {id: users[i].id});
        if(u !== undefined && u.openCount === undefined) {
            getCountsPerUser(users[i].id, users[i], promiseArray);
        }
    }
    if(promiseArray.length > 0) {
        $("#spinnerDiv").show();
        disableButtons();
        Promise.all(promiseArray).then(values => {
            for(i = 0; i < values.length; i++) {
                let userX = values[i];
                if(userX === null) {
                    continue;
                }
                let u = _.findWhere(users, {id: userX.id});
                let u2 = _.findWhere(allUsers, {id: userX.id});
                if(userX.openCount !== undefined) {
                    u.openCount = userX.openCount;
                    u2.openCount = userX.openCount;
                    agentsRead++;
                } else if(userX.pendingCount !== undefined) {
                    u.pendingCount = userX.pendingCount;
                    u2.pendingCount = userX.pendingCount;
                } else if(userX.onHoldCount !== undefined) {
                    u.onHoldCount = userX.onHoldCount;
                    u2.onHoldCount = userX.onHoldCount;
                }
                if(u.openCount !== undefined && u.pendingCount !== undefined && u.onHoldCount !== undefined) {
                    u.totalCount = u.openCount + u.pendingCount + u.onHoldCount;
                    u2.totalCount = u.openCount + u.pendingCount + u.onHoldCount;
                }
            }
            callback();
        }).catch(error => {
            showError(error.statusText);
        });
    } else {
        callback();
    }
}

function getCountsPerUser(userId, user, promises) {
    let openCountPromise = searchTicketsCount(getTicketsByStatusAndUser('open', userId)).then((result) => {
        return {id: user.id, openCount: result.count};
    }).catch(error => {
        if(error.status === 429) {
            // rate limit
            zafClient.invoke('notify', 'API limit reached. Some user counts couldn\'t be loaded. Try again later.', 'error');
            return null;
        } else {
            throw error;
        }
    });
    promises.push(openCountPromise);
    let pendingCountPromise = searchTicketsCount(getTicketsByStatusAndUser('pending', userId)).then((result) => {
       return {id: user.id, pendingCount: result.count};
    }).catch(error => {
        if(error.status === 429) {
            // rate limit
            zafClient.invoke('notify', 'API limit reached. Some user counts couldn\'t be loaded. Try again later.', 'error');
        } else {
            throw error;
        }
    });
    promises.push(pendingCountPromise);
    let onHoldCountPromise = searchTicketsCount(getTicketsByStatusAndUser('hold', userId)).then((result) => {
       return {id: user.id, onHoldCount: result.count};
    }).catch(error => {
        if(error.status === 429) {
            // rate limit
            zafClient.invoke('notify', 'API limit reached. Some user counts couldn\'t be loaded. Try again later.', 'error');
        } else {
            throw error;
        }
    });
    promises.push(onHoldCountPromise);
}

/**
    Refresh ticket counts.
*/
function partialRefresh() {
    if(errorState === true & users.length === 0) {
        $("#spinnerDiv").hide();
        return;
    }
    $('#content').addClass('opacity');
    cleanupUserCounts();

    let getNewCountPromise = searchTicketsCount(getNewTicketsQuery());
    let getOpenCountPromise = searchTicketsCount(getTicketsByStatus('open'));
    let getPendingCountPromise = searchTicketsCount(getTicketsByStatus('pending'));
    let getOnHoldCountPromise = searchTicketsCount(getTicketsByStatus('hold'));
    Promise.all([getNewCountPromise, getOpenCountPromise, getPendingCountPromise, getOnHoldCountPromise]).then(values => {
        totalNewTickets = values[0].count;
        totalOpenTickets = values[1].count;
        totalPendingTickets = values[2].count;
        totalOnHoldTickets = values[3].count;
        totalUnsolvedTickets = totalNewTickets + totalOpenTickets + totalPendingTickets + totalOnHoldTickets;
        sortBy(lastSortColumn, lastSortOrder);
    });
}

/**
    Refresh ticket counts, users, users per group (full reload)
*/
function reload() {
    $('#content').addClass('opacity');
    cleanupCounts();
    cleanupUsers();
    loadData();
}

function cleanupCounts() {
    tickets = [];
    totalNewTickets = 0;
    totalOnHoldTickets = 0;
    totalOpenTickets = 0;
    totalPendingTickets = 0;
    totalUnsolvedTickets = 0;
    ticketsPerUser = [];
    pages = 0;
    agentsRead = 0;
}

function cleanupUserCounts() {
    for(var i = 0; i < users.length; i++) {
       users[i].openCount = undefined;
       users[i].pendingCount = undefined;
       users[i].onHoldCount = undefined;
       users[i].totalCount = undefined;
    }
    for(var i = 0; i < allUsers.length; i++) {
           allUsers[i].openCount = undefined;
           allUsers[i].pendingCount = undefined;
           allUsers[i].onHoldCount = undefined;
           allUsers[i].totalCount = undefined;
        }
}

function cleanupUsers() {
    allUsers = []
    users = [];
    usersView = [];
    groups = {};
    userGroups = [];
    organizationRead = false;
    allAgentsRead = false;
    errorState = false; // only cleanup error state in full refresh
}

/**
    Get Zendesk account settings
    @returns {Promise} promise of account settings JSON object
*/
function getAccountSettings() {
    var settings = {
        url: '/api/v2/account/settings.json',
        type: 'GET',
        contentType: 'application/json'
    };

    return client.request(settings).then((accSettingsResponse) => {
        return accSettingsResponse;
    });
}

/**
    Get single agent based on their id. If user is not found, shows error page.
    Sets agent visibility (allAgentsEnabled, organizationEnabled, groupsEnabled, onlyMineEnabled)
    and selectedDisplay.
    @param {Number} id - agent id
    @returns {Promise} promise of current user JSON object
*/
function getAgent(id) {
    var agent = {
        url : '/api/v2/users/' + id + '.json',
        type : 'GET',
        dataType : 'json',
        contentType : 'application/json',
        headers : {
            Accept : "application/json"
        }
    };
    return client.request(agent).then((response) => {
        currentUser = response.user;
        if(currentUser == null) {
            showError("Error reading current user. Please refresh the page.");
        }
        userRestriction  = currentUser.ticket_restriction;
        userOrganization = currentUser.organization_id;

        allAgentsEnabled = (userRestriction == null);
        organizationEnabled = ((userRestriction === 'organization' || userRestriction == null) && userOrganization !== null);
        groupsEnabled = (userRestriction === 'groups' || userRestriction === 'organization' || userRestriction == null);
        onlyMineEnabled = (userRestriction === 'assigned' || userRestriction === 'requested');

        if(selectedDisplay == null) {
            if(groupsEnabled) {
                selectedDisplay = 'groups';
            } else if(organizationEnabled) {
                selectedDisplay = 'organization';
            } else if(allAgentsEnabled) {
                selectedDisplay = 'allAgents';
            } else {
                selectedDisplay = 'onlyMine';
            }
        }

        return currentUser;
    });
}

/**
    Get all agents starting at page p.  Recursively calls zendesk API until there are no more pages.
    Invoke with 1 as parameter to get all agents.
    In case of error, displays the message in the UI.
    @param {Number} p - page number (first one is 1)
    @returns {Promise} promise of all users JSON object
*/
function getAllAgents(p) {
    var agents = {
        url : '/api/v2/users.json?role[]=agent&role[]=admin&page=' + p,
        type : 'GET',
        dataType : 'json',
        contentType : 'application/json',
        headers : {
            Accept : "application/json"
        }
    };

    client.request(agents).then((agentsResponse) => {
        processUsers(agentsResponse, allUsers);
        if(agentsResponse.next_page !== null) {
          let page = getNextPage(agentsResponse);

          getAllAgents(page);
        } else {
          allAgentsRead = true;
          users = allUsers;
          pages = Math.ceil(users.length / pageSize);
          sortBy(lastSortColumn, lastSortOrder);
        }
    }).catch((error) => {
        errorState = true;
        showError("Error reading group agents: " + error.responseText);
    });
}

/**
    Get agents that belong to a organization. Recursively calls zendesk API until there are no more pages.
    Invoke with 1 as parameter to get all agents in an organization.
    Calls searchTickets() after reading agents.
    In case of error, displays the message in the UI.
    @param {Number} organizationId - id of the organization
    @param {Object} p - page number (first one is 1)
    @returns {Promise} promise returned by searchTickets
*/
function getAgentsByOrganization(organizationId, p) {
    var agents = {
            url : '/api/v2/organizations/' + organizationId + '/users.json?role[]=agent&role[]=admin&page=' + p,
            type : 'GET',
            dataType : 'json',
            contentType : 'application/json',
            headers : {
                Accept : "application/json"
            }
        };

    client.request(agents).then((agentsResponse) => {
            processUsers(agentsResponse, users);
            if(agentsResponse.next_page !== null) {
              let page = getNextPage(agentsResponse);

              getAgentsByOrganization(organizationId, page);
            } else {
              organizationRead = true;
              _.each(users, function(element, index, list) {
                  let u = _.findWhere(allUsers, {id: element.id});
                  if(u === undefined) {
                      allUsers.push(element);
                  }
              });
              pages = Math.ceil(users.length / pageSize);
              sortBy(lastSortColumn, lastSortOrder);
            }
        }).catch((error) => {
            errorState = true;
            showError("Error reading organization agents: " + error.responseText);
        });
}

/**
    Get agents that belong to a group. Recursively calls zendesk API until there are no more pages.
    Invoke with 1 as parameter to get all agents in a group.
    Calls searchTickets() after reading agents.
    In case of error, displays the message in the UI.
    @param {Number} groupId - id of the group
    @param {Object} p - page number (first one is 1)
    @returns {Promise} promise returned by searchTickets
*/
function getAgentsByGroup(groupId, p) {
    client.request(getAgentsByGroupRequest(groupId, p)).then((agentsResponse) => {
            users = [];
            processUsers(agentsResponse, users);
            if(agentsResponse.next_page !== null) {
              let page = getNextPage(agentsResponse);
              getAgentsByGroup(groupId, page);
            } else {
              _.each(users, function(element, index, list) {
                  let u = _.findWhere(allUsers, {id: element.id});
                  if(u === undefined) {
                      allUsers.push(element);
                  }
              });
              let group = _.findWhere(userGroups, {id: parseInt(groupId)});
              if(group !== undefined) {
                  group.selected = true;
              }
              groups[groupId] = users;
              pages = Math.ceil(users.length / pageSize);
              sortBy(lastSortColumn, lastSortOrder);
            }
        }).catch((error) => {
            errorState = true;
            let msg = '';
            if(error.status == 403) {
                msg = 'Your user account does not have sufficient access to view this content. '
                           + 'Please contact your Zendesk Administrator for further details.';
            } else {
                msg = "Error reading group agents: " + error.responseText;
            }
            showError(msg);
        });
}

/**
    Get agents that belong to a group. Recursively calls zendesk API until there are no more pages.
    Invoke with 1 as parameter to get all agents in a group.
    @param {Number} groupId - id of the group
    @param {Object} p - page number (first one is 1)
    @returns {Promise} promise of users by group JSON object
*/
function getAgentsByGroupPromise(groupId, p) {
    return client.request(getAgentsByGroupRequest(groupId, p)).then((agentsResponse) => {
                let userArray = [];
                processUsers(agentsResponse, userArray);
                if(agentsResponse.next_page !== null) {
                  let page = getNextPage(agentsResponse);
                  getAgentsByGroup(groupId, page);
                } else {
                  return userArray;
                }
            }).catch((error) => {
                errorState = true;
                showError("Error reading group agents: " + error.responseText);
            });
}

function processUsers(response, userArray) {
    _.each(response.users, function(user) {
        // don't include light agents or suspended agents
        if((user.custom_role_id === null || user.custom_role_id !== 'light-agent')
            && (includeSuspended || !user.suspended)) {
          let u = _.findWhere(userArray, {id: user.id});
          if(u === undefined) {
              userArray.push(user);
          }
        }
    });
}

function getNextPage(response) {
    let pageIndex = response.next_page.indexOf('?page=') + 6;
    let secondIndex = response.next_page.indexOf('&', pageIndex);
    if(secondIndex > 0) {
      return response.next_page.substr(pageIndex, secondIndex);
    } else {
      return response.next_page.substr(pageIndex);
    }
}

function searchTicketsCount(query) {
    var searchCount = {
        url : '/api/v2/search/count.json?query=' + query,
        type : 'GET',
        headers : {
            Accept : "application/json"
        }
    };

    return client.request(searchCount).then((response) => {
        return response;
    });
}

// Requests

/**
    Get request to read agents by group from Zendesk
    @param {Number} groupId - id of the group
    @param {Number} page - page number (first one is 1)
    @returns {Object} JSON object with request information for Zendesk API call
*/
function getAgentsByGroupRequest(groupId, page) {
    return {
        url : '/api/v2/groups/' + groupId + '/users.json?role[]=agent&role[]=admin&page=' + page,
        type : 'GET',
        dataType : 'json',
        contentType : 'application/json',
        headers : {
            Accept : "application/json"
        }
    };
}

function getNewTicketsQuery() {
    return encodeURIComponent('status<open');
}

function getAllTicketsQuery() {
    return encodeURIComponent('status<solved status>new');
}

function getTicketsByStatus(status) {
    return encodeURIComponent('status:' + status);
}

function getTicketsByStatusAndUser(status, userid) {
    return encodeURIComponent('status:' + status + ' assignee:' + userid);
}

/**
    Get filter object based on status
    @param {Number} status - ticket status to filter by
    @returns {Object} JSON object with request information for Zendesk API call
*/
function getTicketStatusFilter(status) {
    var request = {
        view : {
            all : [
                {
                field : 'status',
                operator : 'is',
                value : status
                }
            ]
        }
    };
    return JSON.stringify(request);
}

/**
    Get request to read all tickets from Zendesk with status less than solved and greater than new.
    @returns {Object} JSON object with request information for Zendesk API call
*/
function getAllTicketsRequest() {
    var request = {
        view : {
            all : [
                {
                    field : 'status',
                    operator : 'less_than',
                    value : 'solved'
                },
                {
                    field : 'status',
                    operator : 'greater_than',
                    value : 'new'
                }
            ],
            output: {
                columns : ['id', 'status', 'assignee_id'],
                group_by : 'assignee_id'
            }
        }
    };
    return JSON.stringify(request);
}

// End of requests

/**
    Sort tickets by a column. Refreshes UI.
    @param {String} field - column to sort by
    @param {String} order - asc or desc
*/
function sortBy(field, order) {
    if(order !== undefined) {
        if(order === 'desc') {
            lastSortOrder = 'asc';
        } else {
            lastSortOrder = 'desc';
        }
    }
    if(field === 'open') {
        sortByOpen();
    } else if(field === 'onhold') {
        sortByOnHold();
    } else if(field === 'pending') {
        sortByPending();
    } else if(field == 'total') {
        sortByTotal();
    } else {
        sortByName();
    }
}

/**
    Sort tickets by agent name. if tickets were already sorted by this field, reverses order.
    Otherwise sets order as asc. Refreshes UI.
*/
function sortByName() {
    page = 1;
    if((lastSortColumn === 'name' && lastSortOrder === 'desc') || lastSortColumn !== 'name') {
        lastSortOrder = 'asc';
        lastSortColumn = 'name';
        users = _.sortBy(users, function(u) { return u.name});
        usersView = users.slice(0, pageSize);
    } else {
        lastSortOrder = 'desc';
        users = _.sortBy(users, function(u) { return u.name}).reverse();
        usersView = users.slice(0, pageSize);
    }
    getCounts();
}

/**
    Sort tickets by Open count. if tickets were already sorted by this field, reverses order.
    Otherwise sets order as asc. Refreshes UI.
*/
function sortByOpen() {
    page = 1;
    if(agentsRead < allUsers.length) {
        // read all
        getAllCounts(sortByOpen);
        return;
    }
    if((lastSortColumn === 'open' && lastSortOrder === 'desc') || lastSortColumn !== 'open') {
        lastSortOrder = 'asc';
        lastSortColumn = 'open';
        users = _.sortBy(users, function(u) { return u.openCount});
        usersView = users.slice(0, pageSize);
    } else {
        lastSortOrder = 'desc';
        users = _.sortBy(users, function(u) { return -u.openCount});
        usersView = users.slice(0, pageSize);
    }
    getCounts();
}

/**
    Sort tickets by Pending count. if tickets were already sorted by this field, reverses order.
    Otherwise sets order as asc. Refreshes UI.
*/
function sortByPending() {
    page = 1;
    if(agentsRead < allUsers.length) {
        // read all
        getAllCounts(sortByPending);
        return;
    }
    if((lastSortColumn === 'pending' && lastSortOrder === 'desc') || lastSortColumn !== 'pending') {
        lastSortOrder = 'asc';
        lastSortColumn = 'pending';
        users = _.sortBy(users, function(u) { return u.pendingCount});
        usersView = users.slice(0, pageSize);
    } else {
        lastSortOrder = 'desc';
        users = _.sortBy(users, function(u) { return -u.pendingCount});
        usersView = users.slice(0, pageSize);
    }
    getCounts();
}

/**
    Sort tickets by On Hold count. if tickets were already sorted by this field, reverses order.
    Otherwise sets order as asc. Refreshes UI.
*/
function sortByOnHold() {
    page = 1;
    if(agentsRead < allUsers.length) {
        // read all
        getAllCounts(sortByOnHold);
        return;
    }
    if((lastSortColumn === 'onhold' && lastSortOrder === 'desc') || lastSortColumn !== 'onhold') {
        lastSortOrder = 'asc';
        lastSortColumn = 'onhold';
        users = _.sortBy(users, function(u) { return u.onHoldCount});
        usersView = users.slice(0, pageSize);
    } else {
        lastSortOrder = 'desc';
        users = _.sortBy(users, function(u) { return -u.onHoldCount});
        usersView = users.slice(0, pageSize);
    }
    getCounts();
}

/**
    Sort tickets by Total count. if tickets were already sorted by this field, reverses order.
    Otherwise sets order as asc. Refreshes UI.
*/
function sortByTotal() {
    page = 1;
    if(agentsRead < allUsers.length) {
        // read all
        getAllCounts(sortByTotal);
        return;
    }
    if((lastSortColumn === 'total' && lastSortOrder === 'desc') || lastSortColumn !== 'total') {
        lastSortOrder = 'asc';
        lastSortColumn = 'total';
        users = _.sortBy(users, function(u) { return u.totalCount});
        usersView = users.slice(0, pageSize);
    } else {
        lastSortOrder = 'desc';
        users = _.sortBy(users, function(u) { return -u.totalCount});
        usersView = users.slice(0, pageSize);
    }
    getCounts();
}

function changePage(newPage) {
    $("#spinnerDiv").show();
    $('#content').addClass('opacity');
    disableButtons();
    page = newPage;
    let startIndex = (page - 1) * pageSize;
    usersView = users.slice(startIndex, startIndex + pageSize);
    getCounts();
}

/**
    Method called when selection in dropdown menu changes.
    Determines selected id and calls changeView(). Refreshes UI.
*/
function displayChanged() {
    let myselect = document.getElementById("select-display");
    selectedDisplay = myselect.options[myselect.selectedIndex].value
    changeView();
}

/**
    Changes agents displayed in table based in dropdown selection. Refreshes UI.
*/
function changeView() {
    _.each(userGroups, function(g) { g.selected = false;});
    if(selectedDisplay === 'allAgents' && allAgentsRead) {
        // selected All Agents. all agents have already being read.
        users = allUsers;
        pages = Math.ceil(users.length / pageSize);
        sortBy(lastSortColumn, lastSortOrder);
    } else if(selectedDisplay === 'allAgents') {
        // selected All Agents. all agents have not being read. read them now
        $("#spinnerDiv").show();
        $('#content').addClass('opacity');
        getAllAgents();
    } else if(selectedDisplay === 'organization' && userRestriction === 'organization' && organizationRead) {
        // selected Organization. organization read. user restriction organization.
        users = allUsers;
        pages = Math.ceil(users.length / pageSize);
        sortBy(lastSortColumn, lastSortOrder);
    } else if((selectedDisplay === 'organization' && organizationRead) ||
                (selectedDisplay === 'organization' && allAgentsRead)) {
        // selected All Agents. all agents have being read.
        users = _.filter(allUsers, function(u) {
            return u.organization_id === userOrganization;
        });
        pages = Math.ceil(users.length / pageSize);
        sortBy(lastSortColumn, lastSortOrder);
    } else if(selectedDisplay === 'organization') {
        // selected Organization. organization agents have not being read. read them now
        users = [];
        $("#spinnerDiv").show();
        $('#content').addClass('opacity');
        getAgentsByOrganization(userOrganization, 1);
    } else {

        if(selectedDisplay.startsWith('group:')) {
            let n = selectedDisplay.indexOf(":") + 1;
            let groupId = selectedDisplay.substring(n, selectedDisplay.length);
            let group = _.findWhere(userGroups, {id: parseInt(groupId)});
            if(group !== undefined) {
                group.selected = true;
            }
            if(groups[groupId] === undefined) {
                $("#spinnerDiv").show();
                $('#content').addClass('opacity');
                getAgentsByGroupPromise(groupId, 1).then((groupUsers) => {
                    _.each(groupUsers, function(element, index, list) {
                        let u = _.findWhere(allUsers, {id: element.id});
                        if(u === undefined) {
                            allUsers.push(element);
                        }
                    });
                    groups[groupId] = _.map(groupUsers, function(groupUser) {
                        let u = _.findWhere(users, {id: groupUser.id});
                        return _.extend(groupUser, u);
                    });
                    users = groupUsers;
                    pages = Math.ceil(users.length / pageSize);
                    sortBy(lastSortColumn, lastSortOrder);
                });
            } else {
                users = groups[groupId];
                pages = Math.ceil(users.length / pageSize);
                sortBy(lastSortColumn, lastSortOrder);
            }
        } else {
            // only me
            users = _.filter(users, function(u) {
                return u.id === currentUser.id;
            });
            pages = 1;
            sortBy(lastSortColumn, lastSortOrder);
        }
    }
}

function disableButtons() {
    $(':button').prop('disabled', true);
    $("#select-display").prop("disabled", true);
    $("#refreshBtn").removeAttr("onclick");
    $(".c-pagination__page").removeAttr("onclick");
}