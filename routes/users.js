const express = require('express');
let request = require('request');
const fs = require('fs');
const router = express.Router();
const fcm = require('./fcm.js');

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

async function getName(req, res, next) {
    const isCredentialsMissing = typeof req.query.user !== 'string' || typeof req.query.password !== 'string' || !req.query.user.length || !req.query.password.length;
    if (isCredentialsMissing) { //error 401 wrong parameters
        return res.send({status: 401, message: 'Error in parameters, missing "user" or "password"'});
    }
    let j = request.jar();
    request = request.defaults({jar: j});

    let header = await _getHeader();
    //console.log('HEADER', header);

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
    res.locals.j = j;
    res.locals.userInfo = userInfo;
    next();
}

async function timeout(req, res, next) {
    //manage a timeout to avoid multi sliding
    let session = JSON.parse(fs.readFileSync('./session.json', 'UTF8'));
    console.log(req.query.user);
    if (session.findIndex(a => a.user === req.query.user) !== -1) {
        console.log(req.query.user + ' is already in timeout');
        return res.send({status: 512, message: 'Request already sent, timeout was activated to prevent multiple slide'});
    }

    session.push(req.query); //comment this to deactive the session management
    fs.writeFileSync('./session.json', JSON.stringify(session, null, 2));

    const timer = req.query['timer'] * 1000 * 60;
    setTimeout(function() {
        next();
    }, timer);
    res.send({status: 200});

}

router.all('/*', function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    next();
});

/* GET users listing. */
router.get('/get', function(req, res) {
    _getHeader(true);
    res.send('respond with a resource');
});

router.get('/credentials', getName, function(req, res) {

    const userInfo = res.locals.userInfo;
    console.log(userInfo);

    res.send({status: 200, ...userInfo});
});

router.get('/', timeout, getName, async function(req, res) {

    // console.log('RES.QUERY', req.query);
    // console.log('RES.LOCALS.USERINFO',res.locals.userInfo);

    const result = await _postPage(res.locals.userInfo.time); //slide here
    fcm.pushMessage(req.query.token, `${res.locals.userInfo.name} - Slided at ${res.locals.userInfo.time} (GMT+2)`);
    //console.log('RESULT');
    //console.log(result);

    //clear cookies
    request = request.defaults({jar: false});

    let session = JSON.parse(fs.readFileSync('./session.json', 'UTF8'));
    session = session.filter(a => a.user !== req.query.user);
    fs.writeFileSync('./session.json', JSON.stringify(session, null, 2));
    console.log('Timeout cleared for ', req.query.user);
    //res.send({status: 200, message: `${userInfo.name} - Slided for ${userInfo.time} (GMT+2)`});
});

module.exports = router;
