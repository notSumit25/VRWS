import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

const spaces = new Map();

io.on('connection', (socket) => {
    console.log('a user connected');
    socket.on('joinSpace', (spaceId, userAttributes) => {
        if (!spaces.has(spaceId)) {
            spaces.set(spaceId, new Map());
        }
        const users = spaces.get(spaceId);
        users.set(socket.id, userAttributes);
        socket.join(spaceId);
        console.log('user joined space', spaceId);
        io.to(spaceId).emit('updateUsers', Array.from(users.values()));
    });

    socket.on('updateAttributes', (spaceId, userAttributes) => {
        const users = spaces.get(spaceId);
        if (users) {
            users.set(socket.id, userAttributes);
            console.log(users);
            io.to(spaceId).emit('updateUsers', Array.from(users.values()));
        }
    });

    socket.on('message', (message, spaceId) => {
        io.to(spaceId).emit('message', message);
    });

    socket.on('disconnect', () => {
        console.log('user disconnected');
        spaces.forEach((users, spaceId) => {
            if (users.delete(socket.id)) {
                io.to(spaceId).emit('updateUsers', Array.from(users.values()));
            }
        });
    });
});


httpServer.listen(3000, () => {
    console.log(`Server is running on port 3000`);
});
