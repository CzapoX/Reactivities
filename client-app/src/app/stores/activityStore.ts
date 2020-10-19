import { observable, action, computed, runInAction, values } from "mobx";
import { SyntheticEvent } from "react";
import { IActivity, IAttendee } from "../models/activity";
import agent from "../api/agent";
import { history } from "../..";
import { toast } from "react-toastify";
import { RootStore } from "./rootStore";
import { IUser } from "../models/user";
import {
  HubConnection,
  HubConnectionBuilder,
  LogLevel,
} from "@microsoft/signalr";

export default class ActivityStore {
  rootStore: RootStore;
  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
  }

  @observable activityRegistry = new Map();
  @observable loadingInitial = false;
  @observable activity: IActivity = null;
  @observable.ref hubConnection: HubConnection = null;
  @observable submitting = false;
  @observable target = "";
  @observable loading = false;

  @action createHubConnection = (activityId: string) => {
    this.hubConnection = new HubConnectionBuilder()
      .withUrl("http://localhost:5000/chat", {
        accessTokenFactory: () => this.rootStore.commonStore.token,
      })
      .configureLogging(LogLevel.Information)
      .build();

    this.hubConnection
      .start()
      .then(() => console.log(this.hubConnection.state))
      .then(() => {
        if (this.hubConnection!.state === "Connected") {
          this.hubConnection.invoke("AddToGroup", activityId);
        }
      })
      .catch((error) => console.log("Error establishing connection", error));

    this.hubConnection.on("ReceiveComment", (comment) => {
      runInAction(() => {
        this.activity.comments.push(comment);
      });
    });
  };

  @action stopHubConnection = () => {
    this.hubConnection
      .invoke("RemoveFromGroup", this.activity.id)
      .then(() => {
        this.hubConnection.stop();
      })
      .catch((err) => console.log(err));
  };

  @action addComment = async (values: any) => {
    values.activityId = this.activity.id;
    try {
      await this.hubConnection.invoke("SendComment", values);
    } catch (error) {
      console.log(error);
    }
  };

  @computed get activitiesByDate() {
    return this.groupActivitiesByDate(
      Array.from(this.activityRegistry.values())
    );
  }

  groupActivitiesByDate(activities: IActivity[]) {
    const sortedActivities = activities.sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );
    return Object.entries(
      sortedActivities.reduce((activities, activity) => {
        const date = activity.date.toISOString().split("T")[0];
        activities[date] = activities[date]
          ? [...activities[date], activity]
          : [activity];
        return activities;
      }, {} as { [key: string]: IActivity[] })
    );
  }

  @action loadActivities = async () => {
    this.loadingInitial = true;
    try {
      const activities = await agent.Activities.list();
      runInAction("loading activities", () => {
        activities.forEach((activity) => {
          this.setActivityProps(activity);
        });
        this.loadingInitial = false;
      });
    } catch (error) {
      runInAction("load activities error", () => {
        console.log(error);
        this.loadingInitial = false;
      });
    }
  };

  @action createActivity = async (activity: IActivity) => {
    this.submitting = true;
    try {
      await agent.Activities.create(activity);
      const attendee = createAttendee(this.rootStore.userStore.user);
      attendee.isHost = true;
      let attendees = [];
      attendees.push(attendee);
      activity.attendees = attendees;
      activity.comments = [];
      activity.isHost = true;
      runInAction("creating activity", () => {
        this.activityRegistry.set(activity.id, activity);
        this.submitting = false;
      });
      history.push(`/activities/${activity.id}`);
    } catch (error) {
      runInAction("error creating activity", () => {
        this.submitting = false;
        console.log(error.response);
        toast.error("Problem submitting data");
      });
    }
  };

  @action editActivity = async (activity: IActivity) => {
    this.submitting = true;
    try {
      await agent.Activities.update(activity);
      runInAction("editing activity", () => {
        this.activityRegistry.set(activity.id, activity);
        this.activity = activity;
        this.activityRegistry.set(activity.id, activity);
        this.submitting = false;
      });
      history.push(`/activities/${activity.id}`);
    } catch (error) {
      runInAction("error editing activity", () => {
        this.submitting = false;
        console.log(error.response);
      });
    }
  };

  @action deleteActivity = async (
    event: SyntheticEvent<HTMLButtonElement>,
    id: string
  ) => {
    this.submitting = true;
    this.target = event.currentTarget.name;
    try {
      await agent.Activities.delete(id);
      runInAction("deleting activity", () => {
        this.activityRegistry.delete(id);
        this.submitting = false;
        this.target = "";
      });
    } catch (e) {
      runInAction("error deleting activity", () => {
        this.submitting = false;
        this.target = "";
        console.log(e);
      });
    }
  };

  @action loadActivity = async (id: string) => {
    let activity = this.getActivity(id);
    if (activity) {
      this.activity = activity;
      return activity;
    } else {
      this.loadingInitial = true;
      try {
        activity = await agent.Activities.details(id);
        runInAction("getting Activity", () => {
          this.setActivityProps(activity);
          this.loadingInitial = false;
        });
        return activity;
      } catch (error) {
        runInAction("error getting Activity", () => {
          this.loadingInitial = false;
        });
        console.log(error);
      }
    }
  };

  @action clearActivity = () => {
    this.activity = null;
  };

  getActivity = (id: string) => {
    return this.activityRegistry.get(id);
  };

  @action attendActivity = async () => {
    const attendee = createAttendee(this.rootStore.userStore.user);
    this.loading = true;
    try {
      if (this.activity) {
        await agent.Activities.attend(this.activity.id);
        runInAction(() => {
          this.activity.attendees.push(attendee);
          this.activity.isGoing = true;
          this.activityRegistry.set(this.activity.id, this.activity);
          this.loading = false;
        });
      }
    } catch (error) {
      runInAction(() => {
        this.loading = false;
      });

      toast.error("Problem signing up to activity");
    }
  };

  @action cancelAttendance = async () => {
    this.loading = true;
    try {
      await agent.Activities.unattend(this.activity!.id);
      runInAction(() => {
        if (this.activity) {
          this.activity.attendees = this.activity.attendees.filter(
            (a) => a.username !== this.rootStore.userStore.user!.username
          );
          this.activity.isGoing = false;
          this.activityRegistry.set(this.activity.id, this.activity);
          this.loading = false;
        }
      });
    } catch (error) {
      runInAction(() => {
        this.loading = false;
      });
      toast.error("Problem cancelling attendance");
    }
  };

  private setActivityProps(activity: IActivity) {
    const user = this.rootStore.userStore.user;
    activity.date = new Date(activity.date);
    activity.isGoing = activity.attendees.some(
      (a) => a.username === user.username
    );
    activity.isHost = activity.attendees.some(
      (a) => a.isHost && a.username === user.username
    );
    this.activityRegistry.set(activity.id, activity);
  }
}

const createAttendee = (user: IUser): IAttendee => {
  return {
    displayName: user.displayName,
    isHost: false,
    username: user.username,
    image: user.image,
  };
};
