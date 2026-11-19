# Network capture samples

Made by `scripts/make-pcap-samples.py`: the same 12 packets as pcap and pcapng.
They include ARP, Modbus/TCP (read, write and an exception reply), IEC 60870-5-104
(STARTDT, I-, S-frames), DNP3, NTP and an IEC 61850 GOOSE frame. All addresses are
private ranges and all payloads are made up.
