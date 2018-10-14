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
    console.log(loginInfo);
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
    return new Promise(function(resolve) {
        request(options, function(error, response, body) {
            if (error) throw new Error(error);
            //fs.writeFileSync('./_file2.html', body);
            resolve(body);
        });
    });
}

function _getPage() { //get page for time
    const options = {
        url: config.urlSlide,
        method: 'GET',
    };
    return new Promise(function(resolve) {
        request(options, function(error, response, body) {
            resolve($('#GMT_DATE', body).val());
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
    if (typeof req.query.user !== 'string' ||
        typeof req.query.password !== 'string') {
        return res.send('error in parameters, missing "user" or "password"');
    }
    console.log(req.query);
    let j = request.jar();
    request = request.defaults({jar: j});

    let header = await _getHeader();
    console.log(header);
    await _postLogin(header, req.query);
    let time = await _getPage();
    if (typeof time !== 'string') {
        return res.send('error during slide');
    }

    let session = JSON.parse(fs.readFileSync('./session.json', 'UTF8'));

    if (session.find(a => a.user === req.query.user)) {
        return res.send('timeout in progress...');
    }

    _postPage(time); //slide here

    //clear cookies
    console.log('tego', time);
    request = request.defaults({jar: false});


    //manage a timeout to avoid multi sliding
    session.push(req.query);
    fs.writeFileSync('./session.json', JSON.stringify(session, null, 2));

    let timeout = 60000 * 60; //1h
    setTimeout(function() {
        console.log('set timeout of ', timeout, 'for', req.query.user);
        let session = JSON.parse(fs.readFileSync('./session.json', 'UTF8'));
        session = session.filter(a => a.user !== req.query.user);
        fs.writeFileSync('./session.json', JSON.stringify(session, null, 2));
        console.log('timeout cleared for ', req.query.user);
    }, timeout);
    res.send('slided for ' + time + '(GMT+2)');
});

module.exports = router;
