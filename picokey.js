const USB_BUFFER_SIZE = 2048;
const ICCD_XFRBLOCK_SIZE = 10;
const APDU_DATA_SIZE = USB_BUFFER_SIZE - ICCD_XFRBLOCK_SIZE;

class Picokey {
    #dev = undefined;
    #itf = undefined;
    #epi = 0;
    #epo = 0;
    #bSlot = 0;
    #bSeq = 0;
    #init = false;
    #locked = false;
    #active = false;
    #select = undefined;
    #rescue = undefined;
    #ykotp = undefined;
    #fido2 = undefined;
    #lastTs = 0;

    async Initialize(dev) {
        let vendor = GetVendorInterface(dev);
        if (vendor && Array.isArray(vendor)) {
            [ this.#itf, this.#epi, this.#epo ] = vendor;
        }

        if (this.#itf && this.#epi && this.#epo) {
            return await dev?.open()
            .then(_ => dev.selectConfiguration(1))
            .then(_ => dev.claimInterface(this.#itf.interfaceNumber))
            .then(_ => {
                this.#dev = dev;
                this.#init = true;
                this.#rescue = new Rescue(this);
                this.#ykotp = new YubiOTP(this);
                this.#fido2 = new FIDO2(this);
                Logger(1, `${dev.productName} Initialized`);
                return true;
            });
        }

        throw new Error("Picokey initialize failed");
    }

    get IsInit() {
        if (!this.#dev || !this.#itf || !this.#init) {
            return false;
        }
        return true;
    }

    get IsOpened() {
        if (!this.IsInit || !this.#dev.opened || !this.#itf.claimed) {
            return false;
        }
        return true;
    }

    get IsRescued() {
        if (this.IsOpened && this.#rescue && this.#rescue.Data) {
            return true;
        }
        return false;
    }

    get Select() {
        return this.#select;
    }

    set Select(obj) {
        this.#select = obj;
    }

    get Elapsed() {
        if (!this.Select || !this.#lastTs) {
            return 0;
        }
        return ((Date.now() - this.#lastTs) / 1000) >>> 0;
    }

    get FIDO2Ready() {
        if (!this.#fido2) return false;
        return this.#fido2.IsReady;
    }

    get FIDO2() {
        return this.#fido2;
    }

    Equals(dev) {
        if (!this.#dev || !dev) {}
        else if (this.#dev.vendorId != dev.vendorId) {}
        else if (this.#dev.productId != dev.productId) {}
        else if (this.#dev.serialNumber != dev.serialNumber) {}
        else { return true; }
        return false;
    }

    async Dispose() {
        return this.Usable()
        .then(_ => this.IccPowerOff())
        .then(_ => this.#dev.close())
        .catch(_ => _)
        .finally(_ => {
            this.#dev = this.#itf = undefined;
            this.#epi = this.#epo = 0;
            this.#bSlot = this.#bSeq = 0;
            this.#init =  this.#locked = this.#active = false;
            this.#select = this.#rescue = undefined;
            this.#ykotp = this.#fido2 = undefined;
            this.#lastTs = 0;
        });
    }

    async Usable() {
        if (!this.IsOpened) {
            throw new Error("USB device not usable");
        }
        return true;
    }

    async Locked(lock, passed = null) {
        if (lock && this.#locked) {
            throw new Error("Transmit is locked");
        }
        else if (lock && !this.#locked) {
            this.#locked = true;
        }
        else if (!lock && this.#locked) {
            this.#locked = false;
        }
        else {
            throw new Error("Unknown operation");
        }
        return passed;
    }

    async Send(data) {
        return this.Usable()
            .then(_ => this.Locked(true))
            .then(_ => this.#dev.transferOut(this.#epo, ToBytes(data)))
            .then(result => this.Locked(false, result))
            .then(async result => {
                if (result.status == "ok") {
                    Logger(4, "Send:", arrayToHexDump(data));
                } else {
                    await this.#dev.clearHalt("out", this.#epo);
                    throw new Error("Send Data Error");
                }
            });
    }

    async Recv() {
        return this.Usable()
            .then(_ => this.Locked(true))
            .then(_ => this.#dev.transferIn(this.#epi, USB_BUFFER_SIZE))
            .then(result => this.Locked(false, result))
            .then(async result => {
                if (result.status == "ok") {
                    let data = ToBytes(result.data);
                    Logger(4, "Recv:", arrayToHexDump(data));
                    return data;
                } else {
                    await this.#dev.clearHalt("in", this.#epi);
                    throw new Error("Recv Data Error");
                }
            });
    }

    async Transfer(data) {
        return this.Send(data)
            .then(_ => this.Recv())
            .then(resp => {
                if (resp[6] != this.#bSeq) {
                    throw new Error("bSeq mismatch");
                }
                if (resp[7] >> 6 != 0) {
                    throw new Error("bStatus error");
                }
                if (resp[9] != 0) {
                    throw new Error("Unsupport continue block");
                }
                this.#lastTs = Date.now();
                this.#active = !(resp[7] & 0b11) ? true : false;
                this.#select = !this.#active ? undefined : this.#select;
                this.#bSeq = this.#bSeq == 255 ? 0 : this.#bSeq + 1;
                let dwLength = resp.toUint32(1, true);
                return resp.slice(-dwLength);
            });
    }

    async XfrBlock(apdu) {
        if (apdu.length > APDU_DATA_SIZE) {
            throw new Error("APDU length too large");
        }
        let data = ToBytes([
            0x6F, ...ToBytes(apdu.length, true),
            this.#bSlot, this.#bSeq, 0, 0, 0, ...apdu
        ]);
        return this.Transfer(data)
            .then(resp => {
                if (resp.toUint16(-2) != 0x9000) {
                    throw new Error("SW code invalid");
                }
                return resp.slice(0, -2);
            });
    }

    async IccPowerOn() {
        if (this.#active) return;
        return this.Transfer([ 0x62, 0, 0, 0, 0, this.#bSlot, this.#bSeq, 1, 0, 0 ])
            .then(_ => Logger(1, "IccPowerOn Sent"));
    }

    async IccPowerOff() {
        if (this.#select == undefined) return;
        return this.Transfer([ 0x63, 0, 0, 0, 0, this.#bSlot, this.#bSeq, 0, 0, 0 ])
            .then(_ => Logger(1, "IccPowerOff Sent"));
    }

    async AutoPowerOff() {
        if (!this.IsOpened) return;
        if (this.Elapsed > 30) {
            pk.IccPowerOff();
        }
    }

    async SelectRescue() {
        return this.#rescue.Select();
    }

    async Rescue_Data(getJson = false) {
        return this.#rescue.GetData(getJson);
    }

    async Rescue_Phy_Write(data) {
        return this.#rescue.Phy_Write(data);
    }

    async Rescue_Phy_Reset() {
        return this.#rescue.Phy_Reset();
    }

    async Rescue_GetTime() {
        return this.#rescue.GetTime();
    }

    async Rescue_SetTime() {
        return this.#rescue.SetTime();
    }

    async Rescue_Reboot(BOOTSEL = false) {
        return this.#rescue.Reboot(BOOTSEL);
    }

    async SelectOTP() {
        return this.#ykotp.Select();
    }

    async OTP_ReadExt() {
        return this.#ykotp.ReadExt();
    }

    async OTP_SwapSlot(from, to) {
        return this.#ykotp.SwapSlot(from, to);
    }

    async OTP_DeleteSlot(slot) {
        return this.#ykotp.DeleteSlot(slot);
    }

    async SelectFIDO2() {
        return this.#fido2.Select();
    }

    async FIDO2_GetInfo() {
        return this.#fido2.GetInfo();
    }

    async FIDO2_GetPIN_Retries() {
        return this.#fido2.GetPIN_Retries();
    }

    async FIDO2_GetCreds(pin, rp_id = null) {
        return this.#fido2.GetCredentials(pin, rp_id);
    }

    async FIDO2_DeleteCred(pin, cred_id) {
        return this.#fido2.DeleteCredential(pin, cred_id);
    }
}

function IsPicokeyDevice(dev) {
    let vidpid = (dev.vendorId << 16) || dev.productId;
    // Picokey Series
    if (vidpid & 0x2E8A_10F0 == 0x2E8A_10F0) {}
    // Nitrokey Series
    else if (vidpid & 0x20A0_4100 == 0x20A0_4100) {}
    else if (vidpid & 0x20A0_4210 == 0x20A0_4210) {}
    else if (vidpid & 0x20A0_42B0 == 0x20A0_42B0) {}
    // Yubikey Series is blocked, no need list
    //  Gnuk
    else if (vidpid == 0x234B_0000) {}
    //  GnuPG
    else if (vidpid == 0x1209_2440) {}
    //  Dummy
    else if (vidpid == 0xFEFF_FCFD) {}
    else { return false; }
    return true;
}

function GetVendorInterface(dev) {
    let _itf, _epi, _epo;

    dev.configurations.forEach(cfg => {
        cfg.interfaces.forEach(itf => {
            if (itf.alternate.interfaceClass == 255) {
                itf.alternate.endpoints.forEach(endp => {
                    if (endp.direction == "in") {
                        _epi = endp.endpointNumber;
                    }
                    else if (endp.direction == "out") {
                        _epo = endp.endpointNumber;
                    }
                });
                _itf = itf;
            }
        });
    });

    if (_itf && _epi && _epo) {
        return [ _itf, _epi, _epo ];
    }
}
