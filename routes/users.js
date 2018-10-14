const express = require('express');
let request = require('request');
const fs = require('fs');
const router = express.Router();

let jsdom = require('jsdom');
const {JSDOM} = jsdom;
const {window} = new JSDOM();
const {document} = (new JSDOM('')).window;
global.document = document;

let $ = jQuery = require('jquery')(window);

let config = {
    urlBase: 'https://hr-services.fr.adp.com',
    urlLoginForm: 'https://hr-services.fr.adp.com/ipclogin/1/loginform.fcc',
    urlSlide: 'https://pointage.adp.com/igested/2_01_00/pointage'
};

//request = request.defaults({jar: true});

function _getHeader(opts) {
    const options = {
        method: 'GET',
        url: config.urlBase,
    };
    return new Promise(function(resolve) {
        request(options, function(error, response, body) {
            if (opts) fs.writeFileSync('./_file.html', body);
            // console.log($('#TARGET', body).val());
            resolve($('#TARGET', body).val());
        });
    });
}

function _postLogin(target, loginInfo) {
    console.log('_postLogin()...');
    const options = {
        method: 'POST',
        url: 'https://hr-services.fr.adp.com/ipclogin/1/loginform.fcc',
        followAllRedirects: true,
        //jar: true,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        form: {
            TARGET: target,
            USER: loginInfo.user,
            PASSWORD: loginInfo.password,
        },
    };
    return new Promise(function(resolve, reject) {
        request(options, function(error, response, body) {
            if (error) throw new Error(error);

            let isError = $('#error', body);
            if (isError.length) {
                reject({message: isError.text().trim()});
            }
            //console.log(response);
            //fs.writeFileSync('./_file2.html', body);
            resolve(body);
        });
    });
}

function _getUserInfo() { //get page for time
    const options = {
        url: config.urlSlide,
        method: 'GET',
    };
    return new Promise(function(resolve) {
        request(options, function(error, response, body) {
            let time = $('#GMT_DATE', body).val();
            let name = $('.texte_nom_prenom', body).text().trim();
            try {
                name = name.replace('Bienvenue, ', '');
            } catch (err) {
                throw new Error(error);
            }
            resolve({name, time});
            //fs.writeFileSync('./_file4.html', body);
        });
    });
}

function _postPage(date) { //slide this
    let options = {
        url: config.urlSlide,
        method: 'POST',
        followAllRedirects: true,
        //jar: true,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        form: {
            'ACTION': 'ENR_PRES',
            'FONCTION': '',
            'GMT_DATE': date,
            'USER_OFFSET': 'MTIw',
        },
    };

    return new Promise(function(resolve) {
        request(options, function(error, response, body) {
            if (error) throw new Error(error);
            console.log(body);
            resolve(body);
        });
    });
}

/* GET users listing. */
router.get('/get', function(req, res) {
    _getHeader(true);
    res.send('respond with a resource');
});

router.get('/', async function(req, res) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.setHeader('Content-Type', 'application/json');

    console.log(req.query);
    console.log(req.query.user.length);
    console.log(req.query.password.length);
    const isCredentialsMissing = typeof req.query.user !== 'string' || typeof req.query.password !== 'string' || !req.query.user.length || !req.query.password.length
    console.log(isCredentialsMissing);
    if (isCredentialsMissing) { //error 401 wrong parameters
        return res.send({status: 401, message: 'Error in parameters, missing "user" or "password"'});
    }
    let j = request.jar();
    request = request.defaults({jar: j});

    let header = await _getHeader();
    console.log('HEADER', header);

    let login = await _postLogin(header, req.query).catch(err => err);
    if (typeof login === 'object') { //error 403 - wrong credentials
        console.log(login);
        return res.send({status: 403, ...login});
    }

    let userInfo = await _getUserInfo();
    console.log(userInfo);
    if (typeof userInfo !== 'object') { //error 404 - unknown error from getting userInfo
        return res.send({status: 404, ...userInfo});
    }

    //add a confirmation here ???

    let session = JSON.parse(fs.readFileSync('./session.json', 'UTF8'));
    if (session.find(a => a.user === req.query.user)) { //multi sliding guarding - 512 timeout in progress
        return res.send({status: 512, message: 'Timeout in progress... Try again later'});
    }

    // await _postPage(time); //slide here


    //clear cookies
    request = request.defaults({jar: false});

    //manage a timeout to avoid multi sliding
    session.push(req.query); //comment this to deactive the session management
    fs.writeFileSync('./session.json', JSON.stringify(session, null, 2));

    let timeout = 10000; //1h
    //let timeout = 60000 * 60; //1h
    console.log('Set timeout of', timeout, 'for', req.query.user);
    setTimeout(function() {
        let session = JSON.parse(fs.readFileSync('./session.json', 'UTF8'));
        session = session.filter(a => a.user !== req.query.user);
        fs.writeFileSync('./session.json', JSON.stringify(session, null, 2));
        console.log('Timeout cleared for ', req.query.user);
    }, timeout);
    res.send({status: 200, message: `Slided for ${userInfo.time} (GMT+2)`});
});

module.exports = router;
