# VM Management

## Architecture

```
Host machine
  │
  ├── virbr-haos (10.99.0.1/24) ← isolated virtual bridge, NAT to internet
  │     │
  │     └── haos-dev VM (10.99.0.13) ← Home Assistant OS 17.1
  │           ├── HA Core 2026.3.1 (port 8123)
  │           └── Supervisor (manages add-ons as Docker containers)
  │
  └── Physical LAN ← HA CANNOT see this (no bridge to physical NIC)
```

**Why isolated**: The VM is on `virbr-haos`, not bridged to the physical NIC.
No mDNS/SSDP/UPnP from the real LAN reaches the VM. HA cannot discover real devices.

## VM Control

CLI tool: `.pi/skills/ha-dev/scripts/vm-ctl`

```bash
.pi/skills/ha-dev/scripts/vm-ctl start       # Boot the VM
.pi/skills/ha-dev/scripts/vm-ctl stop        # Graceful ACPI shutdown
.pi/skills/ha-dev/scripts/vm-ctl kill        # Force stop
.pi/skills/ha-dev/scripts/vm-ctl status      # VM info + IP address
.pi/skills/ha-dev/scripts/vm-ctl ip          # Just the HA URL
.pi/skills/ha-dev/scripts/vm-ctl ssh [cmd]   # SSH into HAOS (runs command if given)
.pi/skills/ha-dev/scripts/vm-ctl console     # VNC display info
.pi/skills/ha-dev/scripts/vm-ctl destroy     # DELETE VM + disk (interactive confirm)
.pi/skills/ha-dev/scripts/vm-ctl logs        # How to view add-on logs
```

### Common SSH commands via vm-ctl

```bash
.pi/skills/ha-dev/scripts/vm-ctl ssh 'ha os info'          # HAOS version, boot slots
.pi/skills/ha-dev/scripts/vm-ctl ssh 'ha core info'         # HA Core version, state
.pi/skills/ha-dev/scripts/vm-ctl ssh 'ha supervisor info'   # Supervisor version
.pi/skills/ha-dev/scripts/vm-ctl ssh 'ha addons'            # List add-ons
.pi/skills/ha-dev/scripts/vm-ctl ssh 'ha host reboot'       # Reboot VM
```

## Setup From Scratch

If the VM needs to be recreated:

```bash
.pi/skills/ha-dev/scripts/setup-vm
```

This is idempotent and will:
1. Create the `haos-isolated` libvirt network (10.99.0.0/24, NAT, no LAN bridge)
2. Download HAOS 17.1 qcow2 image to `/var/lib/libvirt/images/haos/`
3. Create the `haos-dev` VM (4GB RAM, 2 vCPU, UEFI boot, virtio disk+NIC)
4. Wait for DHCP lease and print the HA URL

After setup:
1. Complete onboarding at http://10.99.0.13:8123
2. Install "Terminal & SSH" add-on, configure authorized_keys, map port 22
3. Create a long-lived access token (Profile → Security → Long-lived tokens)
4. Update the token in `.pi/skills/ha-dev/scripts/ha-api`

## Network Details

| Property | Value |
|----------|-------|
| Network name | `haos-isolated` |
| Bridge | `virbr-haos` |
| Subnet | `10.99.0.0/24` |
| Gateway | `10.99.0.1` (host) |
| DHCP range | `10.99.0.10` – `10.99.0.50` |
| Forward mode | NAT (internet only, no LAN bridge) |

Managed via `virsh`:
```bash
sudo virsh net-list                          # List networks
sudo virsh net-dumpxml haos-isolated         # Full network XML
sudo virsh net-dhcp-leases haos-isolated     # Current DHCP leases
```
