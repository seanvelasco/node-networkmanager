import { systemBus, Message, Bus } from 'dbus-native'

const dbus: Bus = systemBus()

const invokeDBUS = (message: Message): Promise<any> => {
	return new Promise((resolve, reject) => {
		dbus.invoke(message, (error, response) => {
			if (error) {
				reject(error)
			} else {
				resolve(response)
			}
		})
	})
}

export default invokeDBUS