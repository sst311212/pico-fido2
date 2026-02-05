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

// Elements for KEY panel
const elm_fido_pin = document.querySelector("#fido_pin");
const elm_fido_pin_retires = document.querySelector("#fido_pin_retries");
const elm_cred_info = document.querySelector("#cred_info");
const elm_cred_group = document.querySelector("#cred_group");
const elm_cred_template = document.querySelector("#cred_template");
const elm_cred_details = document.querySelector("#cred_details");

// Tell connectivity status
const elm_usb_status = document.querySelector("#web_usb_status");
const elm_phy_status = document.querySelector("#web_phy_status");
const elm_fido_status = document.querySelector("#web_fido_status");

// Toast Elements
const elm_msg_toast1 = document.querySelector("#web_msg_toast1");
const elm_msg_toast2 = document.querySelector("#web_msg_toast2");

// Events
const inputEvent = new Event("input");
const changeEvent = new Event("change");

String.prototype.toBytes = function () {
    data = this.split('').map(elm => elm.charCodeAt(0));
    return new Uint8Array(data);
};

Uint8Array.prototype.toUint32 = function (byteOffset = 0, littleEndian = false) {
    byteOffset = byteOffset < 0 ? this.length + byteOffset : byteOffset;
    return new DataView(this.buffer).getUint32(byteOffset, littleEndian);
};

Uint8Array.prototype.toUint16 = function (byteOffset = 0, littleEndian = false) {
    byteOffset = byteOffset < 0 ? this.length + byteOffset : byteOffset;
    return new DataView(this.buffer).getUint16(byteOffset, littleEndian);
};

Uint8Array.fromUint32 = function (value, littleEndian = false) {
    let data = new Uint8Array(4);
    new DataView(data.buffer).setUint32(0, value, littleEndian);
    return data;
};

Uint8Array.fromUint16 = function (value, littleEndian = false) {
    let data = new Uint8Array(2);
    new DataView(data.buffer).setUint16(0, value, littleEndian);
    return data;
};

Uint8Array.fromBigInt = function (value, littleEndian = false) {
    let data = BigInt(value).toString(16);
    data = data.padStart(data.length + (data.length & 1), '0');
    data = Uint8Array.fromHex(data);
    return (littleEndian ? data.toReversed() : data);
};

Uint8Array.prototype.toBase64URL = function () {
    let data = this.toBase64();
    data = data.replaceAll('+', '-');
    data = data.replaceAll('/', '_');
    data = data.replaceAll('=', '');
    return data;
};

Uint8Array.fromBase64URL = function (data) {
    data = data.replaceAll('-', '+');
    data = data.replaceAll('_', '/');
    let mask = data.length & 0b11;
    mask &&= (~mask & 0b11) + 1;
    data = data.padEnd(data.length + mask, '=');
    return Uint8Array.fromBase64(data);
};

function ToBytes(data, little = false, size = 4) {
    var result;
    if (data instanceof Array) {
        result = new Uint8Array(data);
    } else if (data instanceof ArrayBuffer) {
        result = new Uint8Array(data);
    } else if (data instanceof DataView) {
        result = new Uint8Array(data.buffer);
    } else if (data instanceof Uint8Array) {
        result = data;
    } else if (typeof(data) == "string") {
        try {
            result = Uint8Array.fromHex(data);
        } catch {
            try {
                result = Uint8Array.fromBase64URL(data);
            } catch {
                result = data.toBytes();
            }
        }
    } else if (typeof(data) == "bigint") {
        result = Uint8Array.fromBigInt(data, little);
    } else if (typeof(data) == "number") {
        if (size <= 2 && data >=0 && data <= 65535) {
            result = Uint8Array.fromUint16(data, little);
        } else {
            result = Uint8Array.fromUint32(data, little);
        }
    } else {
        throw new Error("Unknown type")
    }
    return result;
}

function arrayToHexDump(data) {
    data = ToBytes(data);
    let list = data.toHex().match(/.{2}/g);
    list = list.map(elm => elm.toUpperCase());
    return list.join(" ");
}

function hexDumpToArray(data) {
    data = data.replaceAll(' ', '');
    return ToBytes(data);
}

function Logger(l, msg, ...args) {
    (logLevel & l) && console.log(msg, ...args);
}

async function DebugCoding() {
    //await pk?.FIDO2_GetInfo();
    //await pk?.FIDO2_GetPIN_Retries();
    //await pk?.FIDO2.GetPINToken("????");
    return;
}

function onDeviceConnect(event) {
    if (!IsPicokeyDevice(event.device)) return;
    new Promise(resolve => setTimeout(async _ => {
        Logger(1, "Picokey Connected", event.device);
        await createPicokey(event.device).then(_ => resolve());
    }, 500));
}

function onDeviceDisconnect(event) {
    if (!IsPicokeyDevice(event.device)) return;
    if (pk?.Equals(event.device)) {
        Logger(1, "Picokey Disconnected", event.device);
        clearDeviceInfo();
        pk.Dispose();
    }
}

function requestDevice(event) {
    return navigator.usb.requestDevice({
        filters: [{ classCode: 255 }]
    }).then(async device => {
        await createPicokey(device);
    });
}

function forgetDevices(event) {
    navigator.usb.getDevices()
    .then(devices => {
        devices.forEach(async dev => {
            if (pk?.Equals(dev)) {
                await pk.Dispose()
                .then(_ => dev.forget());
            }
        })
    })
    .finally(_ => location.reload());
}

async function createPicokey(device) {
    await pk?.Dispose()
    .then(_ => pk.Initialize(device));

    if (debugMode) {
        DebugCoding();
        return;
    }

    await pk?.Rescue_GetTime()
    .catch(_ => pk.Rescue_SetTime())
    .then(_ => showDeviceInfo());
}

async function showDeviceInfo() {
    await pk?.SelectRescue()
    .then(_ => pk.Rescue_Data(true))
    .then(j => {
        elm_pico_platform.value = j.platform;
        elm_pico_product.value = j.product;
        elm_pico_version.value = j.version;
        elm_pico_serial.value = j.serial;
    });
}

function clearBoardInfo() {
    elm_pico_infolist.forEach(elm => {
        elm.value = "";
    });
}

function clearYKOtpInfo() {
    elm_otp_slotlist.forEach(elm => {
        elm.dataset.valid = "";
        elm.value = "";
    });
}

function clearFido2Info() {
    elm_fido_pin_retires.textContent = "";
    elm_fido_status.disabled = true;
}

function clearPasskeyInfo() {
    elm_cred_group.querySelectorAll(".row").forEach(elm => {
        if (elm.id == "cred_template") return;
        elm.remove();
    });
    elm_cred_info.hidden = true;
    elm_cred_details.hidden = true;
}

function clearDeviceInfo() {
    if (!elm_phy_status.disabled) {
        clearBoardInfo();
        clearYKOtpInfo();
    }
    if (!elm_fido_status.disabled) {
        clearFido2Info();
        clearPasskeyInfo();
    }
}

function alertMessage(msg, failed = false) {
    const msg_type = [ elm_msg_toast1, elm_msg_toast2 ];
    let msg_elem = msg_type[failed ? 1 : 0];
    msg_elem.querySelector(".toast-body").textContent = msg;
    new bootstrap.Toast(msg_elem).show();
}

// Interact Webpage faster
function getConnectivity() {
    if (!navigator.usb) {
        // No WebUSB ability
        elm_usb_status.disabled = true;
        elm_phy_status.disabled = true;
        elm_fido_status.disabled = true;
        clearInterval(tim_connectivity);
    }
    else {
        if (!pk) {
            pk = new Picokey();
            return;
        }
        elm_usb_status.disabled = false;
        if (!debugMode && !(pk.IsOpened && pk.IsRescued)) {
            clearDeviceInfo();
            elm_phy_status.disabled = true;
            elm_fido_status.disabled = true;
        } else {
            elm_phy_status.disabled = false;
            !debugMode && pk.AutoPowerOff();
        }
    }
}

// WebUSB backend listener
if (navigator.usb) {
    navigator.usb.addEventListener("connect", onDeviceConnect);
    navigator.usb.addEventListener('disconnect', onDeviceDisconnect);
}
