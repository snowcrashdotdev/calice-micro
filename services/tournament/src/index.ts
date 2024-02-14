import client, { Channel, Connection } from 'amqplib'

const queue = "tournament"

const setupChannel = async (): Promise<Channel> => {
    if (undefined === process.env.AMQP_URI) throw Error('This service requires a message queue connection.')

    try {
        const connection: Connection = await client.connect(process.env.AMQP_URI)
        const channel: Channel = await connection.createChannel()
        await channel.assertQueue(queue, { durable: false })

        return channel
    } catch (e) {
        return setupChannel()
    }

}

const main = async () => {
    const channel = await setupChannel()
    channel.consume(queue, (msg) => {
        if (null !== msg) {
            const input = msg.content.toString()

            channel.sendToQueue(msg.properties.replyTo, Buffer.from(`Tournament service says: ${input}`), {
                correlationId: msg.properties.correlationId
            })

            channel.ack(msg)
        }
    })

    setInterval(() => {}, 1 << 30)
}

main()

export default main