// ==UserScript==
// @name        [LSS] Personalfilter
// @version     0.1.0
// @author      Hekxsler
// @description Filtert zu übernehmendes Personal.
// @match       https://www.leitstellenspiel.de/buildings/*/hire
// @icon        https://www.google.com/s2/favicons?sz=64&domain=leitstellenspiel.de
// @run-at      document-idle
// @grant       none
// ==/UserScript==

(function () {
    "use strict"
    var observer = null
    var loading = false
    var schoolMap = JSON.parse(sessionStorage.getItem('schoolMap')) || {}
    const eduSelect = document.getElementById("education")
    const buildings = document.getElementsByClassName('panel-heading personal-select-heading personnel_pannel_heading')
    const ac = new AbortController();

    var settings = {
        limit: 0,
        hideUneducated: false,
        skipBuildings: 0,
        hidePersonal: "0"
    };
    var storageSettings = JSON.parse(localStorage.getItem('settings'));
    if(storageSettings != null) settings = storageSettings

    function saveSettings(){
        localStorage.setItem('settings', JSON.stringify(settings));
    }

    function toggleLoadingSpan(){
        const span = document.getElementById("loadingspan")
        const style = span.style.visibility
        loading = (style == 'hidden' ? true : false)
        span.style.visibility = (style == 'hidden' ? 'visible' : 'hidden');
    }

    function toggleSettingsDiv(){
        const div = document.getElementById("personalfiltersettings")
        const style = div.style.display
        div.style.display = (style == 'none' ? 'inherit' : 'none');
    }

    function createElementFromHTML(htmlString, right=true) {
        var div = document.createElement('div')
        div.innerHTML = htmlString.trim()
        const el = div.firstChild
        if(right){
            el.style.float = "right"
            el.style.marginRight = "10px"
        }
        return el
    }

    function addPreferences(){
        const div = document.createElement("div") //div
        div.style.textAlign = "center"
        const checkboxBuildings = createElementFromHTML('<label><input id="buildingsfilter" type="checkbox"> Gebäude ohne passende Ausbildung ausblenden</label>', false)
        checkboxBuildings.style.float = "left"
        div.appendChild(checkboxBuildings)
        const loadingSpan = createElementFromHTML('<span id="loadingspan">Loading...</span>', false)
        loadingSpan.style.visibility = "hidden"
        div.appendChild(loadingSpan)
        const settingsBtn = createElementFromHTML('<input id="settingstoggle" type="button" value="&#9881" title="Erweiterte Einstellungen"/>')
        div.appendChild(settingsBtn)
        const selectLimit = createElementFromHTML('<select id="buildingslimit" name="buildingslimit"><option value="0">Alle</option><option value="5">5</option><option value="10">10</option><option value="25">25</option><select/>')
        div.appendChild(selectLimit)
        const selectLimitLabel = createElementFromHTML('<label for="buildingslimit">Anzahl angezeigter Gebäude:</label>')
        div.appendChild(selectLimitLabel)
        const settingsDiv = document.createElement("div") //settings
        settingsDiv.id = "personalfiltersettings"
        settingsDiv.style.display = "none"
        settingsDiv.style.float = "right"
        settingsDiv.style.width = "100%"
        const buildingsskip = createElementFromHTML('<label for="buildingsskip">Gebäude überspringen: <input id="buildingsskip" name="buildingslimit" type="number" min="0"/></label>')
        settingsDiv.appendChild(buildingsskip)
        const checkboxPersonal = createElementFromHTML('<label>Gebäude mit <input id="personalfilter" type="number" min="0"> Ausgebildeten ausblenden</label>', false)
        checkboxPersonal.style.float = "left"
        settingsDiv.appendChild(checkboxPersonal)
        const parent = eduSelect.form.parentElement //parent
        parent.appendChild(div)
        parent.appendChild(settingsDiv)
    }
    addPreferences()
    const settingsBtn = document.getElementById("settingstoggle")
    settingsBtn.addEventListener("click", toggleSettingsDiv)


    async function doRequest(url){
        const promise = Promise.all([
            fetch('https://www.leitstellenspiel.de/'+url),
            new Promise(resolve => setTimeout(resolve, 100)),
        ]).then((vals) => vals[0].text())
        return promise
    }

    function getSchoolType(name) {
        switch (name) {
            case 'feuerwehrschule': return 1
            case 'rettungsschule': return 3
            case 'polizeischule': return 8
            case 'thw_bundesschule': return 10
            default: return null
        }
    }

    function findBuildingByType(response, building_type) {
        const buildings = JSON.parse(response)
        for (var i = 0; i < buildings.length; i++) {
            if (buildings[i].building_type == building_type) return buildings[i].id
        }
        return null
    }

    async function getSchoolId(building_type) {
        if(typeof schoolMap[building_type] == "number") return schoolMap[building_type]
        var result = await doRequest(`api/buildings`).then((response) => {
            return findBuildingByType(response, building_type)
        })
        if(result == null) {
            result = await doRequest(`api/alliance_buildings`).then((response) => {
                return findBuildingByType(response, building_type)
        })}
        schoolMap[building_type] = result
        sessionStorage.setItem('schoolMap', JSON.stringify(schoolMap));
        return result
    }

    function resetBuildings(){
        for (let i = settings.skipBuildings; i < buildings.length; i++) {
            buildings[i].parentElement.style.display = "inherit"
            const labels = buildings[i].getElementsByClassName("label label-success")
            if(labels.length > 0) labels[0].remove()
        }
    }

    async function labelBuilding(building, school_id, education_id){
        const response = await doRequest(`buildings/${school_id}/schoolingEducationCheck?education=${education_id}&only_building_id=${building.getAttribute("building_id")}`)
        if (response.includes("append")) {
            const label = createElementFromHTML(response.split("append('")[1].replace(" ');", ""))
            if(label.innerText[0] == settings.hidePersonal){
                building.parentElement.style.display = "none"
                return false
            }
            const labels = building.getElementsByClassName("label label-success")
            if(labels.length > 0) labels[0].remove()
            building.appendChild(label)
            return true
        }
        if(settings.hideUneducated){
            building.parentElement.style.display = "none"
        }
        return false
    }

    async function updateList(school_name, education_id, end=0, { signal } = { signal: ac.signal }){
        try{
            toggleLoadingSpan()
            resetBuildings()
            var found = 0
            var school_id = await getSchoolId(getSchoolType(school_name))
            if(end == 0) end = buildings.length;
            for (let i = settings.skipBuildings; i < end; i++) {
                const building = buildings[i]
                if((!settings.hideUneducated && i >= (settings.limit+settings.skipBuildings)) || (settings.hideUneducated && found >= settings.limit)){
                    building.parentElement.style.display = "none"
                    continue
                }
                var labelled = await labelBuilding(building, school_id, education_id)
                if(labelled) found++
            }
            toggleLoadingSpan()
        } catch (e) {
            if(e.name != "PerformanceCancel") throw e
        }
    }

    function respondToVisibility(school_id, education_id) {
        let options = {
            root: document.querySelector('#scrollArea'),
            rootMargin: '0px',
            threshold: 1.0
        }
        observer = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if(entry.isIntersecting) {
                    labelBuilding(entry.target, school_id, education_id)
                    observer.unobserve(entry.target)
                }
            })
        }, options);
        for (let i = 0; i < buildings.length; i++) {
            observer.observe(buildings[i]);
        }
    }


    function hideBuildingsEvent(event) {
        settings.hideUneducated = event.target.checked
        var value = eduSelect.value
        if(value != ""){
            updateList(...value.split(","))
        }
        saveSettings()
    }
    const tickBox = document.getElementById("buildingsfilter")
    tickBox.checked = settings.hideUneducated
    tickBox.addEventListener("change", hideBuildingsEvent)

    function limitBuildings(){
        if(settings.limit == 0){
            resetBuildings()
            return
        }
        for (let i = settings.limit+settings.skipBuildings; i < buildings.length; i++) {
            buildings[i].parentElement.style.display = "none"
        }
    }

    function limitUpdateEvent(event){
        settings.limit = event.target.value
        var value = eduSelect.value
        if(value == ""){
            limitBuildings()
        }else{
            updateList(...value.split(","))
        }
        saveSettings()
    }
    const selectLimit = document.getElementById("buildingslimit")
    selectLimit.value = settings.limit
    selectLimit.addEventListener("change", limitUpdateEvent)
    limitBuildings()

    function hideSkipBuildings(){
        for (let i = 0; i < settings.skipBuildings; i++) {
            buildings[i].parentElement.style.display = "none"
        }
    }
    const selectStart = document.getElementById("buildingsskip")
    selectStart.value = settings.skipBuildings
    selectStart.addEventListener("change", function(event){
        settings.skipBuildings = selectStart.value
        hideSkipBuildings()
        resetBuildings()
        limitBuildings()
        saveSettings()
    })
    hideSkipBuildings()

    const selectPersonal = document.getElementById("personalfilter")
    selectPersonal.value = settings.hidePersonal
    selectPersonal.addEventListener("change", function(event){
        settings.hidePersonal = selectPersonal.value
        saveSettings()
    })

    async function selectEducationEvent() {
        if(loading) ac.abort("PerformanceCancel")
        const value = event.target.value
        resetBuildings()
        if (value){
            if(settings.limit > 0){
                if(observer != null) observer.disconnect()
                updateList(...value.split(","))
            }else{
                var education_id = value.split(",")[1]
                var school_id = await getSchoolId(getSchoolType(value.split(",")[0]))
                respondToVisibility(school_id, education_id)
            }
        }else{
            limitBuildings()
        }
    }
    eduSelect.addEventListener("change", selectEducationEvent)

})()
