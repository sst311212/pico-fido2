class CTAPHID {
    static CBOR = 0x10
}

class Ctap2 {}
Ctap2.CMD = class {
    static MAKE_CREDENTIAL    = 0x01
    static GET_ASSERTION      = 0x02
    static GET_INFO           = 0x04
    static CLIENT_PIN         = 0x06
    static RESET              = 0x07
    static GET_NEXT_ASSERTION = 0x08
    static CREDENTIAL_MGMT    = 0x0A
    static SELECTION          = 0x0B
    static LARGE_BLOBS        = 0x0C
    static CONFIG             = 0x0D
}

class ClientPin {}
ClientPin.CMD = class {
    static GET_PIN_RETRIES            = 0x01
    static GET_KEY_AGREEMENT          = 0x02
    static SET_PIN                    = 0x03
    static CHANGE_PIN                 = 0x04
    static GET_TOKEN_USING_PIN_LEGACY = 0x05
    static GET_TOKEN_USING_UV         = 0x06
    static GET_UV_RETRIES             = 0x07
    static GET_TOKEN_USING_PIN        = 0x09
}
ClientPin.RESULT = class {
    static KEY_AGREEMENT     = 0x01
    static PIN_UV_TOKEN      = 0x02
    static PIN_RETRIES       = 0x03
    static POWER_CYCLE_STATE = 0x04
    static UV_RETRIES        = 0x05
}
ClientPin.PERMISSION = class {
    static MAKE_CREDENTIAL            = 0x01
    static GET_ASSERTION              = 0x02
    static CREDENTIAL_MGMT            = 0x04
    static BIO_ENROLL                 = 0x08
    static LARGE_BLOB_WRITE           = 0x10
    static AUTHENTICATOR_CFG          = 0x20
    static PERSISTENT_CREDENTIAL_MGMT = 0x40
}

class CredentialManagement {}
CredentialManagement.CMD = class {
    static GET_CREDS_METADATA       = 0x01
    static ENUMERATE_RPS_BEGIN      = 0x02
    static ENUMERATE_RPS_NEXT       = 0x03
    static ENUMERATE_CREDS_BEGIN    = 0x04
    static ENUMERATE_CREDS_NEXT     = 0x05
    static DELETE_CREDENTIAL        = 0x06
    static UPDATE_USER_INFO         = 0x07
}
CredentialManagement.PARAM = class {
    static RP_ID_HASH       = 0x01
    static CREDENTIAL_ID    = 0x02
    static USER             = 0x03
}
CredentialManagement.RESULT = class {
    static EXISTING_CRED_COUNT  = 0x01
    static MAX_REMAINING_COUNT  = 0x02
    static RP                   = 0x03
    static RP_ID_HASH           = 0x04
    static TOTAL_RPS            = 0x05
    static USER                 = 0x06
    static CREDENTIAL_ID        = 0x07
    static PUBLIC_KEY           = 0x08
    static TOTAL_CREDENTIALS    = 0x09
    static CRED_PROTECT         = 0x0A
    static LARGE_BLOB_KEY       = 0x0B
}

class _PinUv {
    protocol = undefined;
    token = undefined;

    constructor(protocol, token = null) {
        this.protocol = protocol;
        this.token = token;
    }
}

class FIDO2 {
    #key = undefined;
    #data = undefined;
    #ready = false;
    #protocol = undefined;
    #pin_hash = undefined;
    #pin_uv = undefined;
    #last_perm = 0;

    constructor(key) {
        this.#key = key;
        this.#protocol = new PinProtocolV2();
        this.#pin_uv = new _PinUv(this.#protocol);
    }

    get IsReady() {
        return this.#ready;
    }

    async Select() {
        if (this.#key.Select instanceof FIDO2) {
            return this.#data;
        }
        const aid = [ 0xA0, 0x00, 0x00, 0x06, 0x47, 0x2F, 0x00, 0x01 ];
        const apdu = [ 0x00, 0xA4, 0x04, 0x04, aid.length, ...aid, 0x00 ];
        return this.#key.IccPowerOff()
            .then(_ => this.#key.IccPowerOn())
            .then(_ => this.#key.XfrBlock(apdu))
            .then(_ => {
                this.#key.Select = this;
                Logger(1, "Selected FIDO Applet");
            });
    }

    async ExtendedAPDU(cmd, data) {
        let size = data.length & 0xFFFF;
        const apdu = [
            0x00, cmd, 0x00, 0x00,
            0x00, size >> 8, size & 0xFF,   // Lc extened
            ...data,
            0x08, 0x00      // APDU_DATA_SIZE
        ];
        return this.#key.XfrBlock(apdu)
        .then(resp => APDU_CBOR_decode(resp));
    }

    async GetInfo(first = true) {
        return this.Select()
        .then(_ => this.ExtendedAPDU(CTAPHID.CBOR, [ Ctap2.CMD.GET_INFO ]))
        .then(async resp => {
            let opts = resp[4];
            if (!opts.alwaysUv && !opts.clientPin) {
                // Noway, this must be un-initialized
                if (first) {
                    return InitCTAPHID()
                    .then(_ => this.GetInfo(false));
                }
            } else {
                this.#ready = true;
            }
            Logger(1, "FIDO2 Info Read");
            return resp;
        });
    }

    async ClientPin(
        sub_cmd,
        key_agreement = null,
        pin_uv_param = null,
        new_pin_enc = null,
        pin_hash_enc = null,
        permissions = null,
        permissions_rpid = null
    ) {
        let args = new Map();
        args.set(1, 2);
        args.set(2, sub_cmd);
        args.set(3, key_agreement);
        args.set(4, pin_uv_param);
        args.set(5, new_pin_enc);
        args.set(6, pin_hash_enc);
        args.set(9, permissions);
        args.set(10, permissions_rpid);

        let cbor = ToCBOR(args);
        let data = [ Ctap2.CMD.CLIENT_PIN, ...cbor ];

        return this.Select()
        .then(_ => this.ExtendedAPDU(CTAPHID.CBOR, data));
    }

    async CredManagment(sub_cmd, params = null, auth = true) {
        let args = new Map();
        args.set(1, sub_cmd);
        args.set(2, params);

        if (auth) {
            let msg = [ sub_cmd ];
            params && msg.push(...ToCBOR(params));
            let uv_param = await this.#protocol.authenticate(
                this.#pin_uv.token, ToBytes(msg)
            );
            args.set(3, 2);
            args.set(4, uv_param);
        }

        let cbor = ToCBOR(args);
        let data = [ Ctap2.CMD.CREDENTIAL_MGMT, ...cbor ];

        return this.Select()
        .then(_ => this.ExtendedAPDU(CTAPHID.CBOR, data));
    }

    async GetPIN_Retries() {
        return this.ClientPin(ClientPin.CMD.GET_PIN_RETRIES)
        .then(resp => {
            let retries = resp[ClientPin.RESULT.PIN_RETRIES];
            if (retries == undefined) {
                throw new Error("Invalid PIN retries CBOR");
            }
            if (retries == 0) {
                throw new Error("PIN is blocked");
            }
            Logger(1, "PIN Retries:", retries);
            Logger(2, "PIN Retries Read");
            return retries;
        });
    }

    async GetKeyAgreement() {
        return this.ClientPin(ClientPin.CMD.GET_KEY_AGREEMENT)
        .then(resp => {
            let key = resp[ClientPin.RESULT.KEY_AGREEMENT];
            if (key == undefined) {
                throw new Error("Invalid Key Argeement CBOR");
            }
            Logger(2, "KeyAgreement Read");
            return key;
        });
    }

    async GetSharedSecret() {
        return this.GetKeyAgreement()
        .then(key => this.#protocol.encapsulate(key));
    }

    async GetPINToken(pin = null, permission = 0x24) {
        var pin_hash;
        if (pin || (pin && !this.#pin_hash)) {
            // PIN input or no valid pin_hash
            pin_hash = (await sha256(pin.toBytes())).slice(0, 16);
        } else if (!pin && this.#pin_hash) {
            // Use cached pin_hash
            pin_hash = this.#pin_hash;
        } else {
            throw new Error("No PIN entered");
        }

        if (this.#last_perm == permission) {
            if (permission == ClientPin.PERMISSION.PERSISTENT_CREDENTIAL_MGMT)
                return true;
        }

        let [ key_agreement, shared_secret ] = await this.GetSharedSecret();
        let pin_hash_enc = this.#protocol.encrypt(shared_secret, pin_hash);

        let resp = await this.ClientPin(
            ClientPin.CMD.GET_TOKEN_USING_PIN,
            key_agreement, null, null, pin_hash_enc,
            permission, null
        ).then(resp => {
            // PIN verified, cache it for next use
            this.#pin_hash = pin_hash;
            this.#last_perm = permission;
            return resp;
        }).catch(_ => {
            this.#pin_hash = undefined;
            this.#last_perm = 0;
            throw new Error("PIN not verified");
        });

        let pin_token_enc = resp[ClientPin.RESULT.PIN_UV_TOKEN];
        let pin_token = this.#protocol.decrypt(
            shared_secret, ToBytes(pin_token_enc)
        );
        this.#pin_uv = new _PinUv(this.#protocol, pin_token);

        Logger(4, "PIN Token:", arrayToHexDump(pin_token));
        Logger(1, "AuthToken Get");
        return true;
    }

    /** Use EnumRPS for full enumerate */
    async EnumRPSBegin(pin = null) {
        return this.GetPINToken(pin, ClientPin.PERMISSION.PERSISTENT_CREDENTIAL_MGMT)
        .then(_ => this.CredManagment(
            CredentialManagement.CMD.ENUMERATE_RPS_BEGIN
        ));
    }

    /** Use EnumRPS for full enumerate */
    async EnumRPSNext() {
        return this.CredManagment(
            CredentialManagement.CMD.ENUMERATE_RPS_NEXT,
            null, false
        );
    }

    async EnumRPS(pin = null) {
        let resp = await this.EnumRPSBegin(pin);
        
        let rp_list = [];
        let rp_total = resp[CredentialManagement.RESULT.TOTAL_RPS];
        for (let i = 0; ;) {
            rp_list.push({
                rp_id: resp[CredentialManagement.RESULT.RP].id,
                rp_id_hash: resp[CredentialManagement.RESULT.RP_ID_HASH].toHex()
            });
            if (++i >= rp_total) break;
            resp = await this.EnumRPSNext();
        }

        Logger(2, "RP List Get:", rp_list);
        return rp_list;
    }

    async EnumCredsBegin(rp_id_hash, pin = null) {
        let params = new Map();
        params.set(
            CredentialManagement.PARAM.RP_ID_HASH,
            ToBytes(rp_id_hash)
        );

        return this.GetPINToken(pin, ClientPin.PERMISSION.PERSISTENT_CREDENTIAL_MGMT)
        .then(_ => this.CredManagment(
            CredentialManagement.CMD.ENUMERATE_CREDS_BEGIN, params
        ));
    }

    async EnumCredsNext() {
        return this.CredManagment(
            CredentialManagement.CMD.ENUMERATE_CREDS_NEXT,
            null, false
        );
    }

    async EnumCreds(rp_id_hash, pin = null) {
        let resp = await this.EnumCredsBegin(rp_id_hash, pin);

        let cred_list = [];
        let cred_total = resp[CredentialManagement.RESULT.TOTAL_CREDENTIALS];
        for (let i = 0; ;) {
            cred_list.push({
                user: resp[CredentialManagement.RESULT.USER],
                cred_id: resp[CredentialManagement.RESULT.CREDENTIAL_ID].id
            });
            if (++i >= cred_total) break;
            resp = await this.EnumCredsNext();
        }

        Logger(2, "Creds List Get:", cred_list);
        return cred_list;
    }

    async GetCredentials(pin = null, rp_id = null) {

        if (rp_id) {
            rp_id = rp_id.toBytes();
            let rp_id_hash = await sha256(rp_id);
            var rp_list = [{ rp_id, rp_id_hash }];
        } else {
            var rp_list = await this.EnumRPS(pin);
        }

        let all_creds = [];
        for (let i = 0; i < rp_list.length; i++) {
            let rp = rp_list[i];
            let cred_list = await this.EnumCreds(rp.rp_id_hash, pin);
            cred_list.forEach(cred => {
                all_creds.push({
                    rp_id: rp.rp_id,
                    cred_id: cred.cred_id.toHex(),
                    user: {
                        displayName: cred.user.displayName,
                        name: cred.user.name,
                        id: cred.user.id.toHex()
                    }
                });
            });
        }
        
        Logger(2, "All Creds Get:", all_creds);
        return all_creds;
    }

    async DeleteCredential(cred_id, pin = null) {
        let cred_data = new Map();
        cred_data.set("type", "public-key");
        cred_data.set("id", ToBytes(cred_id));
        cred_data.set("transports", [ "usb" ]);

        let params = new Map();
        params.set(CredentialManagement.PARAM.CREDENTIAL_ID, cred_data);

        return this.GetPINToken(pin)
        .then(_ => this.CredManagment(
            CredentialManagement.CMD.DELETE_CREDENTIAL,
            params
        )).then(_ => Logger(1, "Credential Deleted"));
    }
}

class PinProtocolV2 {
    #HKDF_SALT = new Uint8Array(32);
    #HKDF_INFO_HMAC = "CTAP2 HMAC key".toBytes();
    #HKDF_INFO_AES = "CTAP2 AES key".toBytes();
    #shared_secret = undefined;

    async encapsulate(peer_cose_key) {
        let sk = await SECP256R1.create();
        let pn = await sk.GetPublicKeyRaw();

        let key_agreement = new Map();
        key_agreement.set(1, 2);
        key_agreement.set(3, -25);
        key_agreement.set(-1, 1);
        key_agreement.set(-2, pn.x);
        key_agreement.set(-3, pn.y);

        let x = peer_cose_key[-2];
        let y = peer_cose_key[-3];
        let pk = await SECP256R1.create(x, y);
        this.#shared_secret = await sk.deriveBits(pk)
            .then(data => this.kdf(data));

        return [ key_agreement, this.#shared_secret ];
    }

    async kdf(z) {
        let hmac_key = await new HKDF(
            this.#HKDF_SALT,
            this.#HKDF_INFO_HMAC
        ).deriveBits(z);
        Logger(4, "HMAC Key:", hmac_key.toHex());

        let aes_key = await new HKDF(
            this.#HKDF_SALT,
            this.#HKDF_INFO_AES
        ).deriveBits(z);
        Logger(4, " AES Key:", aes_key.toHex());

        return ToBytes([ ...hmac_key, ...aes_key ]);
    }

    encrypt(key, plaintext) {
        let aes_key = key.slice(32);
        let iv = new Uint8Array(16);
        !debugMode && crypto.getRandomValues(iv);

        let cipher = new AES(aes_key, iv);
        let data = cipher.encrypt(plaintext);
        return ToBytes([ ...iv, ...data ]);
    }

    decrypt(key, ciphertext) {
        let aes_key = key.slice(32);
        let iv = ciphertext.slice(0, 16);
        ciphertext = ciphertext.slice(16);

        let cipher = new AES(aes_key, iv);
        return cipher.decrypt(ciphertext);
    }

    async authenticate(key, message) {
        let hmac_key = key.slice(0, 32);
        return await hmac_sha256(hmac_key, message);
    }
}

class SECP256R1 {
    privateKey = undefined;
    publicKey = undefined;

    constructor(priKey, pubKey) {
        this.privateKey = priKey;
        this.publicKey = pubKey;
    }

    static async create(x = null, y = null, d = null) {
        if (!x && !y && !d) {
            return crypto.subtle.generateKey({
                name: "ECDH",
                namedCurve: "P-256"
            }, true, [ "deriveKey", "deriveBits" ])
            .then(key => new SECP256R1(key.privateKey, key.publicKey));
        }

        x &&= ToBytes(x).toBase64URL();
        y &&= ToBytes(y).toBase64URL();
        d &&= ToBytes(d).toBase64URL();

        let keyParam = {
            "crv": "P-256",
            "ext": true,
            kty: "EC",
            x, y
        };

        return crypto.subtle.importKey("jwk", keyParam, {
            name: "ECDH",
            namedCurve: "P-256"
        }, true, [])
        .then(pubKey => {
            if (d) {
                keyParam.d = d;
                keyParam.key_ops = [ "deriveKey", "deriveBits" ];
                return crypto.subtle.importKey("jwk", keyParam, {
                    name: "ECDH",
                    namedCurve: "P-256"
                }, true, keyParam.key_ops)
                .then(priKey => new SECP256R1(priKey, pubKey));
            }
            return new SECP256R1(null, pubKey);
        });
    }

    async GetPublicKeyRaw() {
        return crypto.subtle.exportKey("raw", this.publicKey)
        .then(data => ({ x: data.slice(1, 33), y: data.slice(33) }));
    }

    async deriveBits(key) {
        return crypto.subtle.deriveBits({
            name: "ECDH",
            public: key.publicKey
        }, this.privateKey, 256)
        .then(data => ToBytes(data));
    }
}

class HKDF {
    #salt = undefined;
    #info = undefined;

    constructor(salt, info) {
        this.#salt = salt;
        this.#info = info;
    }

    async deriveBits(key) {
        return crypto.subtle.importKey(
            "raw", key, "HKDF", false, [ "deriveBits" ]
        )
        .then(hkdf => {
            return crypto.subtle.deriveBits({
                name: "HKDF",
                hash: "SHA-256",
                salt: this.#salt,
                info: this.#info
            }, hkdf, key.length << 3);
        })
        .then(data => ToBytes(data));
    }
}

class AES {
    #key = undefined;
    #iv = undefined;

    constructor(key, iv) {
        this.#key = key;
        this.#iv = iv;
    }

    encrypt(plaintext) {
        let cipher = new aesjs.ModeOfOperation.cbc(this.#key, this.#iv);
        return ToBytes(cipher.encrypt(plaintext));
    }

    decrypt(ciphertext) {
        let cipher = new aesjs.ModeOfOperation.cbc(this.#key, this.#iv);
        return ToBytes(cipher.decrypt(ciphertext));
    }
}

function APDU_CBOR_decode(cbor) {
    cbor = (cbor[0] == 0) && cbor.slice(1);
    if (cbor.length < 2) return {};
    Logger(4, "Recv CBOR:", arrayToHexDump(cbor));
    let data = window.CBOR.decode(cbor.buffer);
    Logger(2, "Recv Data:", data);
    return data;
}

function ToCBOR(data) {
    if (data instanceof Map) {
        for ([k,v] of data.entries()) {
            (v == null) && data.delete(k);
        }
    }
    Logger(4, "Send Data:", data);
    let cbor = ToBytes(window.CBOR.encode(data));
    Logger(2, "Send CBOR:", arrayToHexDump(cbor));
    return cbor;
}

async function sha256(data) {
    return crypto.subtle.digest("SHA-256", data)
    .then(hash => ToBytes(hash));
}

async function hmac_sha256(key, data) {
    return crypto.subtle.importKey("raw", key, {
        name: "HMAC",
        hash: "SHA-256"
    }, false, [ "sign" ])
    .then(hmac => crypto.subtle.sign("HMAC", hmac, data))
    .then(hash => ToBytes(hash));
}

/**
 * Because WebUSB disabled using SmartCard HID interface
 * and Picokey only execute init_fido() when CTAPHID_INIT sent.
 * Therefore, I use navigator.credentials.get() to send CTAPHID.INIT.
*/
async function InitCTAPHID() {
    return new Promise(resolve => {
        let control = new AbortController();
        // dont care the result
        navigator.credentials.get({
            signal: control.signal,
            publicKey: {
                challenge: new Uint8Array(16),
                hints: [ "security-key" ]
            }
        }).catch(_ => true);

        // 1.5sec should enough for init
        setTimeout(() => { 
            control.abort() & resolve();
        }, 1500);
    });
}

async function GetReady() {
    if (!pk?.FIDO2Ready) {
        throw new Error("FIDO2 not initialized");
    }
    elm_fido_status.disabled = false;
}

async function GetPIN() {
    GetReady();
    let pin = String(elm_fido_pin.value);
    if (!pin || pin.length < 4 || pin.length > 63) {
        throw new Error("PIN input invalid");
    }
    return pin;
}

async function GetFido2Info() {
    await pk?.Usable()
    .then(_ => GetReady())
    .catch(_ => pk.FIDO2_GetInfo())
    .then(_ => GetPINRetries())
    .catch(e => alertMessage(e.message, true));
}

function GetPINRetries() {
    return pk?.Usable()
    .then(_ => GetReady())
    .then(_ => pk.FIDO2_GetPIN_Retries())
    .then(resp => {
        elm_fido_pin_retires.textContent = resp;
    })
    .catch(e => alertMessage(e.message, true));
}

function GetPassKeys() {
    return pk?.Usable()
    .then(_ => GetPIN())
    .then(pin => pk.FIDO2_GetCreds(pin))
    .then(resp => showCredentails(resp))
    .catch(e => alertMessage(e.message, true));
}

function DeletePasskey(elem) {
    let cred_elem = [ ...elm_cred_group.children ].filter(
        elm => (elm.querySelector(".btn") == elem)
    ).pop();
    if (!cred_elem) return;
    let cred_item = cred_elem.children.cred_item;
    let cred_id = cred_item.JsData.cred_id;

    return pk?.Usable()
    .then(_ => GetPIN())
    .then(pin => pk.FIDO2_DeleteCred(cred_id, pin))
    .then(_ => alertMessage("Credential Deleted"))
    .catch(e => alertMessage(e.message, true));
}

function showCredentails(key_list) {
    clearPasskeyInfo();
    for (let i = 0; i < key_list.length; i++) {
        let elem = elm_cred_template.cloneNode(true);
        let elem_item = elem.querySelector("#cred_item");
        let elem_rpid = elem_item.querySelector(".card-title");
        let elem_name = elem_item.querySelector(".card-subtitle");

        elem.id = "";
        elem.hidden = false;
        elem_item.JsData = key_list[i];
        elem_item.addEventListener("click", onPasskeyItemClick);

        elem_rpid.textContent = key_list[i].rp_id;
        elem_name.textContent = key_list[i].user.name;

        elm_cred_group.appendChild(elem);
    }
    if (key_list.length > 0) {
        elm_cred_info.hidden = false;
    } else {
        elm_cred_info.hidden = true;
    }
}

function onPasskeyItemClick(event) {
    let srcElem = event.currentTarget;
    let srcJson = srcElem.JsData;

    if (!srcElem.active) {
        document.querySelectorAll("#cred_item").forEach(elm => {
            elm.active = false;
        });
        srcElem.active = true;
        elm_cred_details.hidden = false;
    } else {
        elm_cred_details.hidden = true;
        srcElem.active = false;
        srcElem.classList.toggle("active");
    }

    let detailElem = elm_cred_details.querySelectorAll(".card-subtitle");
    let detailData = [ srcJson.rp_id, srcJson.user.displayName,
        srcJson.user.name, srcJson.user.id, srcJson.cred_id ];
    for (let i = 0; i < detailElem.length; i++) {
        detailElem[i].textContent = detailData[i];
    }
};
