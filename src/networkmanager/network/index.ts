import invokeDBUS from "../../dbus"
import { activateConnection } from '../connections'
import { getConnectionSettings } from "../settings"
import { stringToArrayOfBytes, stringToArrayOfNumbers, networkValidator } from '../utils'

export const replaceNetwork = async (ssid?: string): Promise<string> => {
    await forgetNetwork(ssid)
    return await addNetwork(ssid)
}

export const scanWirelessNetworks = async (
	devicePath: string
): Promise<object[]> => {
	const [, [networkPaths]] = await invokeDBUS({
		destination: "org.freedesktop.NetworkManager",
		path: devicePath,
		interface: "org.freedesktop.DBus.Properties",
		member: "Get",
		signature: "ss",
		body: ["org.freedesktop.NetworkManager.Device.Wireless", "AccessPoints"]
	})

	const properties = [
		"Ssid",
		"Frequency",
		"Strength",
		"Mode",
		"HwAddress",
		"MaxBitrate",
		"Flags",
		"WpaFlags",
		"RsnFlags",
		"LastSeen"
	]

	const availableNetworks: object[] = []

	await Promise.all(
		networkPaths.map(async (networkPath) => {
			const property: { [key: string]: string } = {}
			await Promise.all(
				properties.map(async (attr) => {
					const [, [value]] = await invokeDBUS({
						destination: "org.freedesktop.NetworkManager",
						path: networkPath,
						interface: "org.freedesktop.DBus.Properties",
						member: "Get",
						signature: "ss",
						body: [
							"org.freedesktop.NetworkManager.AccessPoint",
							attr
						]
					})

					property[attr] = value.toString()
				})
			)
			availableNetworks.push(property)
		})
	)
	return availableNetworks
}

export const addNetwork = async (
	ssid?: string,
	password?: string,
	force?: boolean,
	manual?: { [key: string]: string }
): Promise<string> => {
	// Skip saving a wireless network if the given SSID matches an existing network and the force flag is not set
	// If the force flag is set, the existing network will be forgotten first and then the new network will be saved

	const savedNetworks = await listSavedNetworks()
	const duplicateNetwork = savedNetworks.find((network) => network["ssid"] === ssid)

	try {
		if (
			(duplicateNetwork && (force === null || force === false))
		) {
			throw `Network configuration for ${ssid} already exists.\nNetwork Manager may connect to this network if found unless overriden in later steps in Setup Mode.\nTo override, use the force flag (force=true).`
		} else if (duplicateNetwork && force === true) {
			console.log(
				`Network configuration for ${ssid} already exists.\nAttempting to replace existing network.`
			)
			return await replaceNetwork()
		}

		const settings = [
			[
				"connection",
				[
					["id", ["s", ssid]],
					["type", ["s", "802-11-wireless"]]
				]
			],
			[
				"802-11-wireless",
				[
					["ssid", ["ay", stringToArrayOfBytes(ssid)]],
					["mode", ["s", "infrastructure"]]
				]
			],
			[
				"802-11-wireless-security",
				[
					["key-mgmt", ["s", "wpa-psk"]],
					["psk", ["s", password]]
				]
			],

			["ipv6", [["method", ["s", "auto"]]]]
		]

		if (manual) {
			// const ipAddress = "192.168.1.100"
			// const netmask = "255.255.255.0"
			// const gateway = "192.168.1.1"
			// const dns = "8.8.8.8"

			const method = [
				"ipv4",
				[
					["method", ["s", "manual"]],
					[
						"address-data",
						[
							"aa{sv}",
							[
								[
									["address", ["s", manual.address]],
									["prefix", ["u", 24]]
								]
							]
						]
					],

					["gateway", ["s", manual.gateway]],

					// Set DNS to Google, signature "au"
					["dns", ["au", stringToArrayOfNumbers(manual.dns)]], // ["dns", ["au", [8, 8, 8, 8]]],

					// ["dns", ["as", [dns]]],
					// routes aau
					["routes", ["aau", []]]
					// ["netmask", ["s", netmask]]
				]
			]
			settings.push(method)
		} else {
			// ["ipv4", [["method", ["s", "auto"]]]], // 'auto' = dhcp, 'manual' = static
			const method = ["ipv4", [["method", ["s", "auto"]]]]
			settings.push(method)
		}

		return await invokeDBUS({
			destination: "org.freedesktop.NetworkManager",
			path: "/org/freedesktop/NetworkManager/Settings",
			interface: "org.freedesktop.NetworkManager.Settings",
			member: "AddConnection",
			signature: "a{sa{sv}}",
			body: [settings]
		})
	} catch (error) {
		new Error(`Unable to add network: ${error}`)
		throw error
	}
}

export const forgetNetwork = async (networkPath?: string, ssid?: string): Promise<void> => {

	// Use network settings path if provided, otherwise use SSID to derive network settings path

	if (ssid && !networkPath) {
		networkPath = await networkValidator(ssid)
	}

	return await invokeDBUS({
		destination: "org.freedesktop.NetworkManager",
		path: networkPath,
		interface: "org.freedesktop.NetworkManager.Settings.Connection",
		member: "Delete"
	})
}

export const listSavedNetworks = async (): Promise<any[]> => {

	// Among list of saved settings, if a wireless network setting is found, locate SSID

	// Get all network-related settings

	const networkSettingList: string[] = await invokeDBUS({
		destination: "org.freedesktop.NetworkManager",
		path: "/org/freedesktop/NetworkManager/Settings",
		interface: "org.freedesktop.NetworkManager.Settings",
		member: "ListConnections"
	})

	const savedConnections = await Promise.all(
		networkSettingList.map(async (network) => {
			const networkSettings = await getConnectionSettings(network) // Get properties of an instance of a network settng
			const wirelessNetworkSettings = networkSettings.find(
				(setting) => setting[0] === "802-11-wireless"
			)
			if (wirelessNetworkSettings) {
				// Filter for wireless network settings
				const [, settings] = wirelessNetworkSettings
				const wirelessNetworkSSID = settings.find(
					(setting) => setting[0] === "ssid"
				)
				if (wirelessNetworkSSID) {
					const [, [, [SSID]]] = wirelessNetworkSSID
					return { ssid: SSID.toString(), path: network }
				}
			}
		})
	)

	return savedConnections.filter((element) => element) // Returns array of saved wireless connections with removed undefined or nullified elements

	// Network validation for avoiding duplicates is unable to perform its function if there is an undefined or nullified element in the array

}

export const createAccessPoint = async (ssid: string, password: string, device: { [key: string]: string }) => {
	try {
		// Returns a network settings path if the SSID of the Access Point matches an existing network
		const networkInstance = await networkValidator(ssid)

		if (networkInstance) {
			console.log(
				`Using existing configuration for creating ${ssid} Access Point using ${device["driver"]} (${device["iface"]}).`
			)

			// Use existing network settings path & network device path to create Access Point
			await activateConnection(networkInstance, device["path"])

			console.log(
				`Access Point credentials\nSSID: ${ssid}\nPassword: ${password}\n`
			)

			return
		}

		const settings = [
			[
				"connection",
				[
					["id", ["s", ssid]],
					["type", ["s", "802-11-wireless"]]
				]
			],
			[
				"802-11-wireless",
				[
					["ssid", ["ay", stringToArrayOfBytes(ssid)]],
					["mode", ["s", "ap"]]
				]
			],
			[
				"802-11-wireless-security",
				[
					["key-mgmt", ["s", "wpa-psk"]],
					["psk", ["s", password]],
					["group", ["as", ["ccmp"]]], // Enables WPA2-PSK
					["pairwise", ["as", ["ccmp"]]], // Enables WPA2-PSK
					["proto", ["as", ["rsn"]]] // Enables WPA2-PSK
				]
			],
			["ipv4", [["method", ["s", "shared"]]]], // Launches a dnsmasq process & creates the appropriate NAT rules for internet sharing
			["ipv6", [["method", ["s", "ignore"]]]] // Disables IPv6
		]

		const connection = await invokeDBUS({
			destination: "org.freedesktop.NetworkManager",
			path: "/org/freedesktop/NetworkManager/Settings",
			interface: "org.freedesktop.NetworkManager.Settings",
			member: "AddConnection",
			signature: "a{sa{sv}}",
			body: [settings]
		})

		console.log(
			`Creating an Access Point using ${device["driver"]} (${device["iface"]}) for the first time.`
		)

		await activateConnection(connection, device["path"])

		console.log(
			`Access Point credentials\nSSID: ${ssid}\nPassword: ${password}\n`
		)

		return
	} catch (error) {
		console.error(`Unable to create an Access Point: ${error}.`)
	}
}

export const internetSharingOverEthernet = async () => {
	try {
		const settings = [
			[
				"connection",
				[
					["id", ["s", "Internet Sharing over Ethernet"]],
					["type", ["s", "802-3-ethernet"]]
				]
			],
			[
				"802-3-ethernet",
				[
					["auto-negotiate", ["b", false]]
					// ["mode", ["s", "infrastructure"]]
				]
			],

			["ipv4", [["method", ["s", "shared"]]]],
			["ipv6", [["method", ["s", "ignore"]]]]
		]

		const settingsPath = await invokeDBUS({
			destination: "org.freedesktop.NetworkManager",
			path: "/org/freedesktop/NetworkManager/Settings",
			interface: "org.freedesktop.NetworkManager.Settings",
			member: "AddConnection",
			signature: "a{sa{sv}}",
			body: [settings]
		})

		return settingsPath
	} catch (error) {
		console.log(error)
	}
}