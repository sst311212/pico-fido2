// Elements for WebUSB panel
const elm_pico_platform = document.querySelector("#pico_platform");
const elm_pico_product = document.querySelector("#pico_product");
const elm_pico_version = document.querySelector("#pico_version");
const elm_pico_serial = document.querySelector("#pico_serial");
const elm_pico_infolist = [
    elm_pico_platform, elm_pico_product, elm_pico_version, elm_pico_serial
];

// Elements for PHY panel
const elm_usb_vendor = document.querySelector("#phy_usb_vendor");
const elm_usb_vidpid = document.querySelector("#phy_usb_vidpid");
const elm_usb_product = document.querySelector("#phy_usb_product");
const elm_btn_timeout = document.querySelector("#phy_btn_timeout");
const elm_led_gpio = document.querySelector("#phy_led_gpio");
const elm_led_btness = document.querySelector("#phy_led_btness");
const elm_opts_dimm = document.querySelector("#phy_opts_dimm");
const elm_opts_steady = document.querySelector("#phy_opts_steady");
const elm_opts_rainbow = document.querySelector("#phy_opts_rainbow");
const elm_curve_secp256k1 = document.querySelector("#phy_curve_secp256k1");
const elm_led_driver = document.querySelector("#phy_led_driver");
const elm_btn_timeout_set = document.querySelector("#phy_btn_timeout_set");
const elm_led_btness_set = document.querySelector("#phy_led_btness_set");
const elm_led_options_set = document.querySelector("#phy_led_options_set");
const elm_curve_options_set = document.querySelector("#phy_curve_options_set");
const elm_phy_rangelist = [ elm_btn_timeout, elm_led_btness ];

// Elements for OTP panel
const elm_otp_slot1 = document.querySelector("#otp_slot_1");
const elm_otp_slot2 = document.querySelector("#otp_slot_2");
const elm_otp_slot3 = document.querySelector("#otp_slot_3");
const elm_otp_slot4 = document.querySelector("#otp_slot_4");
const elm_otp_slotlist = [
    elm_otp_slot1, elm_otp_slot2, elm_otp_slot3, elm_otp_slot4
];

// Tell connectivity status
const elm_usb_status = document.querySelector("#web_usb_status");
const elm_phy_status = document.querySelector("#web_phy_status");

// Toast Elements
const elm_phy_toast = new bootstrap.Toast(document.querySelector("#web_phy_toast"));

// Intervals
const tim_connectivity = setInterval(getConnectivity, 50);

// Events
const inputEvent = new Event("input");
const changeEvent = new Event("change");

function onDeviceConnect(event) {
    if (IsPicokeyDevice(event.device)) {
        console.log("Picokey connected", event.device);
        new Promise(resolve => {
            setTimeout(_ => {
                createPicokey(event.device)
                .then(_ => resolve())
            }, 200);
        })
    }
}

function onDeviceDisconnect(event) {
    if (IsPicokeyDevice(event.device)) {
        if (pk.Equals(event.device)) {
            pk.Dispose();
            clearDeviceInfo();
        }
        console.log("Picokey disconnected", event.device);
    }
}

function requestDevice(event) {
    return navigator.usb.requestDevice({
        filters: [{
            classCode: 255
        }]
    })
    .then(async device => await createPicokey(device));
}

function forgetDevices(event) {
    navigator.usb.getDevices()
    .then(devices => {
        devices.forEach(async dev => {
            if (pk.Equals(dev)) {
                await pk.Dispose()
                .then(_ => dev.forget());
            }
        })
    })
    .then(_ => location.reload());
}

async function createPicokey(device) {
    await pk.Dispose()
    .then(_ => pk.Initialize(device))
    .then(_ => pk.IccPowerOn())
    .then(_ => showDeviceInfo());
}

async function showDeviceInfo() {
    await pk.SelectRescue()
    .then(_ => pk.Rescue_Data(true))
    .then(json => {
        elm_pico_platform.value = json.platform;
        elm_pico_product.value = json.product;
        elm_pico_version.value = json.version;
        elm_pico_serial.value = json.serial;
    })
    .then(_ => pk.Rescue_SetTime());
}

function GetPhyConfig() {
    let config = {};
    let vidpid = String(elm_usb_vidpid.value);
    let gpio = parseInt(elm_led_gpio.value);
    let btness = parseInt(elm_led_btness.value);
    let btness_set = Boolean(elm_led_btness_set.checked);
    let dimm = Boolean(elm_opts_dimm.checked);
    let steady = Boolean(elm_opts_steady.checked);
    let rainbow = Boolean(elm_opts_rainbow.checked);
    let led_opt_set = Boolean(elm_led_options_set.checked);
    let up_btn = parseInt(elm_btn_timeout.value);
    let up_btn_set = Boolean(elm_btn_timeout_set.checked);
    let product = String(elm_usb_product.value);
    let secp256k1 = Boolean(elm_curve_secp256k1.checked);
    let curve_set = Boolean(elm_curve_options_set.checked);
    let driver = parseInt(elm_led_driver.value);

    vidpid = vidpid.replace(':', '');
    if (vidpid.length == 8) {
        var data = parseInt(vidpid[0], 16);
        for (i = 1; i < vidpid.length; i++) {
            data = (data << 4) + parseInt(vidpid[i], 16);
        }
        config["vidpid"] = data;
    }
    if (gpio >= 0 && gpio <= 29) {
        config["led_gpio"] = gpio;
    }
    if (btness_set && btness >= 0 && btness <= 15) {
        config["led_btness"] = btness;
    }
    if (led_opt_set) {
        config["opts"] = { dimm, steady, rainbow };
    }
    if (up_btn_set && up_btn >= 0 && up_btn <= 60) {
        config["up_btn"] = up_btn;
    }
    if (product) {
        config["product"] = product;
    }
    if (curve_set) {
        config["curve"] = { secp256k1 };
    }
    if (driver) {
        config["driver"] = driver;
    }

    return config;
}

// Interact Webpage faster
function getConnectivity() {
    if (!navigator.usb) {
        // No WebUSB ability
        elm_usb_status.disabled = true;
        clearInterval(tim_connectivity);
    }
    else {
        if (!pk) {
            pk = new Picokey();
        }
        elm_usb_status.disabled = false;
        if (!pk.IsOpened || !pk.IsRescued) {
            elm_phy_status.disabled = true;
            clearDeviceInfo();
        }
        else {
            elm_phy_status.disabled = false;
            pk.AutoPowerOff();
        }
    }
}

function clearBoardInfo() {
    elm_pico_infolist.forEach(elm => (elm.value = ""));
}

function clearYKOtpInfo() {
    elm_otp_slotlist.forEach(elm => {
        elm.dataset.valid = "";
        elm.value = "";
    });
}

function clearDeviceInfo() {
    clearBoardInfo();
    clearYKOtpInfo();
}

function showInputRangeValue(event) {
    var elem = document.querySelector(`#${event.target.id}_val`);
    if (elem) {
        elem.textContent = event.target.value;
    }
}

// Disable custom VID/PID input
elm_usb_vendor.addEventListener("change", event => {
    elm_usb_vidpid.value = event.target.value;
    elm_usb_vidpid.disabled = !(!event.target.value);
});

elm_phy_rangelist.forEach(elm => {
    elm.addEventListener("input", showInputRangeValue);
});

// WebUSB backend listener
if (navigator.usb) {
    navigator.usb.addEventListener("connect", onDeviceConnect);
    navigator.usb.addEventListener('disconnect', onDeviceDisconnect);
}

setTimeout(_ => {
    elm_usb_vendor.dispatchEvent(changeEvent);
    elm_btn_timeout.dispatchEvent(inputEvent);
    elm_led_btness.dispatchEvent(inputEvent);

    if (navigator.usb) {
        pk.Usable()
        .catch(_ => {
            navigator.usb.getDevices()
            .then(devices => {
                devices.forEach(async dev => await createPicokey(dev));
            });
        });
    }
}, 100);
