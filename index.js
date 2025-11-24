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
const threshhold = 10; // keeping for backward compatibility
const VOICE_PROXIMITY_THRESHOLD = 150; // pixels - distance for voice/video proximity

// Enhanced proximity calculation for LiveKit voice/video
const calculateProximityUsers = (x1, y1, spaceId) => {
  const users = spaces.get(spaceId);
  if (!users) return [];

  const nearbyUsers = [];
  users.forEach((user, socketId) => {
    const distance = Math.sqrt(
      Math.pow(x1 - user.x, 2) + Math.pow(y1 - user.y, 2)
    );
    if (distance <= VOICE_PROXIMITY_THRESHOLD) {
      nearbyUsers.push({
        socketId,
        clerkId: user.clerkId,
        name: user.name,
        x: user.x,
        y: user.y,
        distance: Math.round(distance),
        audioLevel: Math.max(0, 1 - distance / VOICE_PROXIMITY_THRESHOLD),
      });
    }
  });

  return nearbyUsers.sort((a, b) => a.distance - b.distance);
};

// Existing chat proximity function (keeping for backward compatibility)
const calculateDistance = (x1, y1, spaceId) => {
  const users = spaces.get(spaceId);
  const underThresholdUsers = [];
  if (users) {
    users.forEach((user) => {
      const dis = Math.abs(x1 - user.x) + Math.abs(y1 - user.y);
      if (dis < threshhold) {
        underThresholdUsers.push(user);
      }
    });
  }
  return underThresholdUsers;
};

io.on("connection", (socket) => {
  console.log("a user connected");
  socket.on("joinSpace", (spaceId, userAttributes) => {
    if (!spaces.has(spaceId)) {
      spaces.set(spaceId, new Map());
    }
    const users = spaces.get(spaceId);
    users.set(socket.id, userAttributes);
    socket.join(spaceId);
    console.log("user joined space", spaceId);

    // Send initial proximity data to the joining user
    const nearbyUsers = calculateProximityUsers(
      userAttributes.x,
      userAttributes.y,
      spaceId
    );
    socket.emit("proximityUpdate", {
      nearbyUsers,
      timestamp: Date.now(),
    });

    // Keep existing functionality
    io.to(spaceId).emit("updateUsers", Array.from(users.values()));
  });

  socket.on("updateAttributes", (spaceId, userAttributes) => {
    const users = spaces.get(spaceId);
    if (users) {
      users.set(socket.id, userAttributes);

      // Calculate proximity for voice/video
      const nearbyUsers = calculateProximityUsers(
        userAttributes.x,
        userAttributes.y,
        spaceId
      );

      // Send proximity update to the moving user
      socket.emit("proximityUpdate", {
        nearbyUsers,
        timestamp: Date.now(),
      });

      // Notify other nearby users about position change
      nearbyUsers.forEach((nearbyUser) => {
        const otherSocket = io.sockets.sockets.get(nearbyUser.socketId);
        if (otherSocket) {
          const theirNearbyUsers = calculateProximityUsers(
            nearbyUser.x,
            nearbyUser.y,
            spaceId
          );
          otherSocket.emit("proximityUpdate", {
            nearbyUsers: theirNearbyUsers,
            timestamp: Date.now(),
          });
        }
      });

      // Keep existing functionality
      io.in(spaceId).emit("updateUsers", Array.from(users.values()));
    }
  });

  socket.on("message", (message, spaceId) => {
    socket.to(spaceId).emit("message", message);
  });

  socket.on("disconnect", () => {
    console.log("user disconnected");
    spaces.forEach((users, spaceId) => {
      if (users.delete(socket.id)) {
        io.to(spaceId).emit("updateUsers", Array.from(users.values()));
      }
    });
  });
});

httpServer.listen(3000, () => {
  console.log(`Server is running on port 3000`);
});
