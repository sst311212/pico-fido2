import usb.core
from usb.core import Device, Interface, Endpoint
import usb.util

class Vendor:
    NitroHSM    = 0x20A0_4230
    NitroFIDO2  = 0x20A0_42B1
    NitroStart  = 0x20A0_4211
    NitroPro    = 0x20A0_4108
    Nitro3      = 0x20A0_42B2
    Yubikey5    = 0x1050_0407
    YubikeyNeo  = 0x1050_0116
    YubiHSM     = 0x1050_0030
    Gnuk        = 0x234B_0000
    GnuPG       = 0x1209_2440
    Dummy       = 0xFEFF_FCFD

class PHY:
    VIDPID              = 0x0
    LED_GPIO            = 0x4
    LED_BTNESS          = 0x5
    OPTS                = 0x6
    UP_BTN              = 0x8
    USB_PRODUCT         = 0x9
    ENABLED_CURVES      = 0xA
    ENABLED_USB_ITF     = 0xB
    LED_DRIVER          = 0xC

    OPT_WCID                = 0x1
    OPT_DIMM                = 0x2
    OPT_DISABLE_POWER_RESET = 0x4
    OPT_LED_STEADY          = 0x8
    OPT_LED_RAINBOW         = 0x10

    CURVE_SECP256K1     = 0x8

    USB_ITF_CCID        = 0x1
    USB_ITF_WCID        = 0x2
    USB_ITF_HID         = 0x4
    USB_ITF_KB          = 0x8

    LED_DRIVER_PICO         = 0x1
    LED_DRIVER_PIMORONI     = 0x2
    LED_DRIVER_WS2812       = 0x3
    LED_DRIVER_CYW43        = 0x4
    LED_DRIVER_NEOPIXEL     = 0x5
    LED_DRIVER_SWAP         = 0x80

class APDU:
    INS_KEYDEV_SIGN     = 0x10
    INS_WRITE           = 0x1C
    INS_SECURE          = 0x1D
    INS_READ            = 0x1E
    INS_REBOOT_BOOTSEL  = 0x1F

class PHY_BASE(object):
    def __init__(self):
        self._dict: dict[int, dict] = {}

    def __str__(self) -> str:
        data = []
        for i in self._dict.keys():
            if self._dict[i]["value"]:
                data.append(self._dict[i]["name"])
        if len(data) == 0:
            return "None"
        return "|".join(data)
    
    def __repr__(self):
        return f"<{self.__str__()}>"
    
    @property
    def Value(self):
        data = 0
        for i in self._dict.keys():
            if self._dict[i]["value"]:
                data |= i
        return data
    
    @Value.setter
    def Value(self, data: int):
        for i in self._dict.keys():
            self._dict[i]["value"] = True if data & i else False

class PHY_OPT(PHY_BASE):
    def __init__(self):
        self._dict = {
            PHY.OPT_WCID: { "name": "WCID", "value": False },
            PHY.OPT_DIMM: { "name": "DIMM", "value": False },
            PHY.OPT_DISABLE_POWER_RESET: { "name": "DISABLE_POWER_RESET", "value": False },
            PHY.OPT_LED_STEADY: { "name": "LED_STEADY", "value": False },
            PHY.OPT_LED_RAINBOW: { "name": "LED_RAINBOW", "value": False },
        }

class PHY_CURVE(PHY_BASE):
    def __init__(self):
        self._dict = {
            PHY.CURVE_SECP256K1: { "name": "SECP256K1", "value": False },
        }

class PHY_USB_ITF(PHY_BASE):
    def __init__(self):
        self._dict = {
            PHY.USB_ITF_CCID: { "name": "CCID", "value": False },
            PHY.USB_ITF_WCID: { "name": "WCID", "value": False },
            PHY.USB_ITF_HID: { "name": "HID", "value": False },
            PHY.USB_ITF_KB: { "name": "KB", "value": False },
        }

class PHY_LED_DRIVER(PHY_BASE):
    def __init__(self):
        self._dict = {
            PHY.LED_DRIVER_PICO: { "name": "Pico (Standard)", "value": False },
            PHY.LED_DRIVER_PIMORONI: { "name": "Pimoroni", "value": False },
            PHY.LED_DRIVER_WS2812: { "name": "WS2812", "value": False },
            PHY.LED_DRIVER_CYW43: { "name": "CYW43", "value": False },
            PHY.LED_DRIVER_NEOPIXEL: { "name": "Neo Pixel", "value": False },
            PHY.LED_DRIVER_SWAP: { "name": "Swap", "value": False },
        }
    
    @property
    def Value(self):
        data = 0
        for i in self._dict.keys():
            if self._dict[i]["value"]:
                data |= i
        return data
    
    @Value.setter
    def Value(self, data: int):
        if data > 0x80 and data & 15 <= 5:
            data &= 15
            self._dict[PHY.LED_DRIVER_SWAPPED]["value"] = True
        self._dict[data]["value"] = True

class PhyData:
    def __init__(self):
        self.__vid: int = None
        self.__pid: int = None
        self.__vidpid: int = None
        self.__led_gpio: int = None
        self.__led_brightness: int = None
        self.__opts: PHY_OPT = None
        self.__up_btn: int = None
        self.__usb_product: str = None
        self.__enabled_curves: PHY_CURVE = None
        self.__enabled_usb_itf: PHY_USB_ITF = None
        self.__led_driver: PHY_LED_DRIVER = None
    
    @property
    def vid(self):
        return self.__vid
    
    @vid.setter
    def vid(self, data: int):
        if data > 0xFFFF:
            raise Exception("vid: value must between 0 to 65535")
        self.__vid = data
        if self.__vid and self.__pid:
            self.__vidpid = self.__vid << 16 | self.__pid
    
    @property
    def pid(self):
        return self.__pid
    
    @pid.setter
    def pid(self, data: int):
        if data > 0xFFFF:
            raise Exception("pid: value must between 0 to 65535")
        self.__pid = data
        if self.__vid and self.__pid:
            self.__vidpid = self.__vid << 16 | self.__pid

    @property
    def vidpid(self):
        return self.__vidpid
    
    @vidpid.setter
    def vidpid(self, data: int):
        if data > 0xFFFFFFFF:
            raise Exception("vidpid: value must between 0 to 4294967295")
        self.__vid = data >> 16
        self.__pid = data & 0xFFFF
        self.__vidpid = data
    
    @property
    def led_gpio(self):
        return self.__led_gpio
    
    @led_gpio.setter
    def led_gpio(self, data: int):
        if data < 0 or data > 28:
            raise Exception("led_gpio: value must between 0 to 28")
        self.__led_gpio = data
    
    @property
    def led_brightness(self):
        return self.__led_brightness
    
    @led_brightness.setter
    def led_brightness(self, data: int):
        if data < 0 or data > 15:
            raise Exception("led_brightness: value must between 0 to 15")
        self.__led_brightness = data

    @property
    def opts(self):
        return self.__opts
    
    @opts.setter
    def opts(self, data: int):
        if data < 0 or data > 31:
            raise Exception("opts: value must between 0 to 31")
        if not self.__opts:
            self.__opts = PHY_OPT()
        self.__opts.Value = data
    
    @property
    def up_btn(self):
        return self.__up_btn
    
    @up_btn.setter
    def up_btn(self, data: int):
        if data < 0 or data > 60:
            raise Exception("up_btn: value must between 0 to 60")
        self.__up_btn = data
    
    @property
    def usb_product(self):
        return self.__usb_product
    
    @usb_product.setter
    def usb_product(self, data: str):
        if len(data) == 0 or len(data) > 31:
            raise Exception("usb_product: string length must between 1 to 31")
        self.__usb_product = data
    
    @property
    def enabled_curves(self):
        return self.__enabled_curves
    
    @enabled_curves.setter
    def enabled_curves(self, data: int):
        if not (data == 0 or data == PHY.CURVE_SECP256K1):
            raise Exception("enabled_curves: value must equal 0 or 8")
        if not self.__enabled_curves:
            self.__enabled_curves = PHY_CURVE()
        self.__enabled_curves.Value = data
    
    @property
    def enabled_usb_itf(self):
        return self.__enabled_usb_itf
    
    @enabled_usb_itf.setter
    def enabled_usb_itf(self, data: int):
        if data < 1 or data > 15:
            raise Exception("enabled_usb_itf: value must between 1 to 15")
        if not self.__enabled_usb_itf:
            self.__enabled_usb_itf = PHY_USB_ITF()
        self.__enabled_usb_itf.Value = data
    
    @property
    def led_driver(self):
        return self.__led_driver
    
    @led_driver.setter
    def led_driver(self, data: int):
        if not (data > 0 and data & 15 <= 5):
            raise Exception("led_driver: value must between 1 to 5")
        if not self.__led_driver:
            self.__led_driver = PHY_LED_DRIVER()
        self.__led_driver.Value = data

    @classmethod
    def Parse(self, data: list[int]):
        base = self()
        p, length = 0, len(data)
        while p < length:
            tag, tlen = data[p], data[p + 1]
            buff = data[p + 2:][:tlen]
            match tag:
                case PHY.VIDPID:
                    if tlen == 4:
                        base.vidpid = int.from_bytes(buff, 'big')
                case PHY.LED_GPIO:
                    if tlen == 1:
                        base.led_gpio = buff[0]
                case PHY.LED_BTNESS:
                    if tlen == 1:
                        base.led_brightness = buff[0]
                case PHY.OPTS:
                    if tlen == 2:
                        base.opts = int.from_bytes(buff, 'big')
                case PHY.UP_BTN:
                    if tlen == 1:
                        base.up_btn = buff[0]
                case PHY.USB_PRODUCT:
                    if tlen > 0 and tlen <= 32:
                        if buff[-1] == 0:
                            buff = buff[:-1]
                        base.usb_product = bytes(buff).decode()
                case PHY.ENABLED_CURVES:
                    if tlen == 4:
                        base.enabled_curves = int.from_bytes(buff, 'big')
                case PHY.ENABLED_USB_ITF:
                    if tlen == 1:
                        base.enabled_usb_itf = buff[0]
                case PHY.LED_DRIVER:
                    if tlen == 1:
                        base.led_driver = buff[0]
            p += (2 + tlen)
        return base
    
    @property
    def Value(self):
        data: list[int] = []
        if self.vidpid is not None:
            data += [ PHY.VIDPID, 4, *self.vidpid.to_bytes(4, 'big') ]
        if self.led_gpio is not None:
            data += [ PHY.LED_GPIO, 1, self.led_gpio ]
        if self.led_brightness is not None:
            data += [ PHY.LED_BTNESS, 1, self.led_brightness ]
        if self.opts is not None:
            data += [ PHY.OPTS, 2, *self.opts.Value.to_bytes(2, 'big') ]
        if self.up_btn is not None:
            data += [ PHY.UP_BTN, 1, self.up_btn ]
        if self.usb_product is not None:
            size = len(self.usb_product) + 1
            buff = self.usb_product.encode()
            data += [ PHY.USB_PRODUCT, size, *buff, 0 ]
        if self.enabled_curves is not None:
            data += [ PHY.ENABLED_CURVES, 4, *self.enabled_curves.Value.to_bytes(4, 'big') ]
        if self.enabled_usb_itf is not None:
            data += [ PHY.ENABLED_USB_ITF, 1, self.enabled_usb_itf.Value ]
        if self.led_driver is not None:
            data += [ PHY.LED_DRIVER, 1, self.led_driver.Value ]
        return data

class Picokey:
    def __init__(self):
        self.device: Device = None
        self.interface: Interface = None
        self.inEndpoint: Endpoint = None
        self.outEndpoint: Endpoint = None
        self.bSlot: int = 0
        self.bSeq: int = 0
        self.phy_data: PhyData = None
    
    @classmethod
    def find_device(cls):
        base = cls()
        devices = list[Device](usb.core.find(find_all=True))
        for dev in devices:
            if dev.bDeviceClass != 0:
                continue
            for cfg in dev.configurations():
                interfaces = list[Interface](cfg.interfaces())
                for intf in interfaces:
                    if intf.bInterfaceClass != 0xff:
                        continue
                    base.device = dev
                    base.interface = intf
        
        if not base.device or not base.interface:
            return None
        
        endpoints = list[Endpoint](base.interface.endpoints())
        for endp in endpoints:
            base.inEndpoint = endp if usb.util.endpoint_direction(endp.bEndpointAddress) == usb.util.ENDPOINT_IN else base.inEndpoint
            base.outEndpoint = endp if usb.util.endpoint_direction(endp.bEndpointAddress) == usb.util.ENDPOINT_OUT else base.outEndpoint
        
        if not base.inEndpoint or not base.outEndpoint:
            return None
        
        return base

    def close_device(self):
        if self.device:
            usb.util.dispose_resources(self.device)
            self.device = None
    
    @classmethod
    def bytesToHexString(cls, data: list[int]) -> str:
        data = list[str](map(lambda x : f"{x:02X}", data))
        return " ".join(data)
    
    def Send(self, data: list[int]):
        self.bSeq = self.bSeq + 1 if self.bSeq < 255 else 0
        #print(f"Send: {self.bytesToHexString(data)}")
        self.device.write(self.outEndpoint, data, 2000)

    def Recv(self):
        resp = list[int](self.device.read(self.inEndpoint, 4096, 2000))
        #print(f"Recv: {self.bytesToHexString(resp)}\n")
        return resp

    def Transfer(self, data: list[int]):
        self.Send(data)
        return self.Recv()
    
    def IccPowerOn(self):
        resp = self.Transfer([ 0x62, 0, 0, 0, 0, self.bSlot, self.bSeq, 1, 0, 0 ])
        if (resp[7] >> 6) != 0:
            raise Exception("IccPowerOn failed")
    
    def IccPowerOff(self):
        resp = self.Transfer([ 0x63, 0, 0, 0, 0, self.bSlot, self.bSeq, 0, 0, 0 ])
        if (resp[7] >> 6) != 0:
            raise Exception("IccPowerOff failed")
    
    def Apdu2XfrData(self, apdu: list[int]):
        data = [ 0x6F ]                                         # bMessageType
        data += list((len(apdu).to_bytes(4, 'little')))         # dwLength
        data += [ self.bSlot, self.bSeq, 0 ]                    # bSlot, bSeq, bReserved
        data += [ 0, 0 ]                                        # wLevelParameter
        data += apdu                                            # abData
        return data
    
    def XfrBlock(self, apdu: list[int] | None = None):
        resp = self.Transfer(self.Apdu2XfrData(apdu))
        if (resp[7] >> 6) != 0:
            raise Exception("XfrBlock failed")
        
        dwLength = int.from_bytes(resp[1:5], 'little')
        bChainParameter = resp[9]
        if dwLength > 0 and bChainParameter == 0:
            apdu = resp[-dwLength:-2]
            sw1, sw2 = resp[-2], resp[-1]
            if sw1 != 0x90 and sw2 != 0:
                raise Exception("APDU command failed")
            return apdu
        
        return resp
    
    def enter_rescue(self):
        resp = self.XfrBlock([ 0x00, 0xA4, 0x04, 0x04, 0x08, 0xA0, 0x58, 0x3F, 0xC1, 0x9B, 0x7E, 0x4F, 0x21, 0x00 ])
        PICO_MCU = [ "RP2040", "RP2350", "ESP32", "EMULATION" ]
        PICO_PRODUCT = [ "Pico Key SDK", "Pico HSM", "Pico Fido", "Pico OpenPGP" ]
        print("-------------- Board Info --------------")
        print(f"Platform: {PICO_MCU[resp[0]]}")
        print(f" Product: {PICO_PRODUCT[resp[1]]}")
        print(f" Version: {resp[2]}.{resp[3]}")
        print(f"  Serial: {"".join(map(lambda x : f"{x:02X}", resp[4:]))}")
        print("----------------------------------------")
    
    def PhyRead(self):
        resp = self.XfrBlock([ 0x80, APDU.INS_READ, 1, 0, 0, 1, 0 ])
        data = self.phy_data = PhyData.Parse(resp)
        if not data.vidpid:
            data.vid = self.device.idVendor
            data.pid = self.device.idProduct
        print("--------------- PHY Info ---------------")
        print(f"     VID/PID: {data.vid:04X}:{data.pid:04X}")
        print(f"Product Name: {data.usb_product if data.usb_product else "undefined"}")
        print(f" PHY Options: {data.opts}")
        print(f" BTN Timeout: {data.up_btn}")
        print(f" LED Bright.: {data.led_brightness}")
        print(f"LED GPIO Pin: {data.led_gpio}")
        print(f"  LED Driver: {data.led_driver}")
        print(f"      Curves: {data.enabled_curves}")
        print(f"  Interfaces: {data.enabled_usb_itf}")
        print("----------------------------------------")

    def PhyWrite(self, data: list[int]):
        apdu = [ 0x80, APDU.INS_WRITE, 1, 0 ]
        apdu += [ len(data) ]                   # Lc
        apdu += data                            # Nc
        apdu += [ 0 ]                           # Le
        self.XfrBlock(apdu)
    
    # Custom firmware only
    def PhyReset(self):
        apdu = [ 0x80, APDU.INS_WRITE, 1, 0xFF, 0, 1, 0 ]
        self.XfrBlock(apdu)
    
    def Reboot(self, BOOTSEL: bool = False):
        apdu = [ 0x80, APDU.INS_REBOOT_BOOTSEL, (1 if BOOTSEL else 0), 0, 0, 1, 0 ]
        self.Send(self.Apdu2XfrData(apdu))

def main():
    pk = Picokey.find_device()
    if not pk:
        return -1
    
    pk.IccPowerOff()
    pk.IccPowerOn()
    pk.enter_rescue()
    pk.PhyRead()

    phy_data = PhyData()
    phy_data.vidpid = Vendor.Yubikey5
    phy_data.usb_product = "YubiKey"
    phy_data.opts = PHY.OPT_DIMM | PHY.OPT_LED_RAINBOW
    phy_data.up_btn = 0
    phy_data.led_brightness = 3
    phy_data.led_driver = PHY.LED_DRIVER_WS2812 | PHY.LED_DRIVER_SWAP

    pk.PhyWrite(phy_data.Value)
    pk.PhyRead()
    pk.Reboot()

    pk.IccPowerOff()
    pk.close_device()
    pass

if __name__ == "__main__":
    main()
