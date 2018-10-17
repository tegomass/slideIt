var FCM = require('fcm-node');

var serverKey = ''; //put your server key here
var fcm = new FCM(serverKey);

module.exports = {
    pushMessage: function(to, body){
        const message = { //this may vary according to the message type (single recipient, multicast, topic, et cetera)
            to,
            notification: {
                title: 'Slide done !',
                body
            },
        };
        fcm.send(message, function(err, response){
            if (err) {
                console.log("Something has gone wrong!");
            } else {
                console.log("Successfully sent with response: ", response);
            }
        });
    }
};