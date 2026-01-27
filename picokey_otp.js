/* TKT Flags */
const CHAL_YUBICO       = 0x20
const CHAL_RESP         = 0x40
const OATH_HOTP         = 0x40
/* CFG Flags */
const SHORT_TICKET      = 0x02
const STATIC_TICKET     = 0x20
const CHAL_HMAC         = 0x22

class YubiOTP {
    #key = undefined;
    #data = undefined;

    constructor(key) {
        this.#key = key;
    }

    async Select() {
        if (this.#key.Select == this) {
            return this.#data;
        }
        const aid = [ 0xA0, 0x00, 0x00, 0x05, 0x27, 0x20, 0x01 ];
        const apdu = [ 0x00, 0xA4, 0x04, 0x04, aid.length, ...aid, 0x00 ];
        return this.#key.IccPowerOn()
            .then(_ => this.#key.XfrBlock(apdu))
            .then(resp => {
                this.#key.Select = this;
                this.#data = new Uint8Array(resp);
                console.log("Selected OTP Applet");
                return resp;
            });
    }

    async ReadExt() {
        return this.Select()
        .then(_ => this.#key.XfrBlock([ 0x00, 0x01, 0x14, 0, 0, 1, 0 ]))
        .then(resp => {
            console.log("OTP Extent Status Read");
            return resp;
        });
    }

    async SwapSlot(from, to) {
        const st_map = [
            [ [-1,-1], [0,0], [0,1], [0,2] ],
            [ [0,0], [-1,-1], [1,1], [1,2] ],
            [ [0,1], [1,1], [-1,-1], [2,2] ],
            [ [0,2], [1,2], [2,2], [-1,-1] ],
        ];
        var st = st_map[(from >>> 0) - 1][(to >>> 0) - 1];
        
        return this.Select()
        .then(_ => this.#key.XfrBlock([ 0x00, 0x01, 0x06, 0, 2, st[0], st[1], 2 ]))
        .then(_ => console.log("OTP Slot Swapped"));
    }

    async DeleteSlot(slot) {
        const st_map = [ [1,0], [3,0], [1,2], [1,3] ];
        var otp_config = new Uint8Array(52);
        var [st1, st2] = st_map[(slot >>> 0) - 1];

        return this.Select()
        .then(_ => this.#key.XfrBlock([ 0x00, 0x01, st1, st2, otp_config.length, ...otp_config, 0 ]))
        .then(_ => console.log("OTP Slot Deleted"));
    }
}

function arrayToModHex(data) {
    const modhex_tab = [
        'c', 'b', 'd', 'e', 'f', 'g', 'h', 'i',
        'j', 'k', 'l', 'n', 'r', 't', 'u', 'v'
    ];
    let hex_list = [];
    for (i = 0; i < data.length; i++) {
        hex_list.push(modhex_tab[data[i] >> 4]);
        hex_list.push(modhex_tab[data[i] & 15]);
    }
    return hex_list.join('');
}

function onOtpReadExtClick(elem) {
    pk.Usable()
    .then(_ => clearYKOtpInfo())
    .then(_ => pk.OTP_ReadExt())
    .then(resp => showYKOtpInfo(resp));
}

function onOtpSwapClick(elem) {
    var swap = elem.dataset.swap;
    if (!swap || swap[1] != ',') {
        return;
    }
    var [s1, s2] = swap.split(',');
    console.log(`Swap: ${s1} -> ${s2}`);
    pk.OTP_SwapSlot(s1, s2)
    .then(_ => clearYKOtpInfo())
    .then(_ => pk.OTP_ReadExt())
    .then(resp => showYKOtpInfo(resp));
}

function onOtpDeleteClick(elem) {
    var slot = parseInt(elem.dataset.slot);
    if (!slot || slot < 1 || slot > 4) {
        return;
    }
    pk.OTP_DeleteSlot(slot)
    .then(_ => clearYKOtpInfo())
    .then(_ => pk.OTP_ReadExt())
    .then(resp => showYKOtpInfo(resp));
}

function showYKOtpInfo(data) {
    var data = new Uint8Array(data);
    var i = 0;
    while (i < data.length) {
        var slot_id = data[i++];
        if (slot_id < 0xB0 || slot_id > 0xB3) {
            continue;
        }
        slot_id &= 15;

        var slot_len = data[i++];
        if (data[i] != 0xA0 || data[i + 1] != 2) {
            i += slot_len;
            continue;
        }
        i += 2;
        slot_len -= 2;

        var tkt_flags = data[i++];
        var cfg_flags = data[i++];
        slot_len -= 2;

        if (tkt_flags & CHAL_RESP && cfg_flags < OATH_HOTP && cfg_flags & CHAL_HMAC) {
            var cred_type = "Challenge-Response";
        }
        else if (tkt_flags & CHAL_RESP && cfg_flags & OATH_HOTP) {
            var cred_type = "OATH-HOTP";
        }
        else if (cfg_flags & SHORT_TICKET || cfg_flags & STATIC_TICKET) {
            var cred_type = "Static Password";
        }
        else {
            var cred_type = "Yubico OTP";
            if (data[i] == 0xC0 && data[i + 1] == 6) {
                var serial = data.slice(i + 2, i + 8);
                var modhex = arrayToModHex(serial);
            }
            cred_type += ` (${modhex})`;
        }

        if (cred_type) {
            var slot_elm = elm_otp_slotlist[slot_id];
            slot_elm.dataset.valid = true;
            slot_elm.value = cred_type;
        }

        i += slot_len;
    }
}
